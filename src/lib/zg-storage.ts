/* eslint-disable @typescript-eslint/no-explicit-any */
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { ethers } from 'ethers';
import { Indexer, ZgFile } from '@0glabs/0g-ts-sdk';
import { getPrivyEvmWalletAddress } from '@/lib/privy';

const ZG_RPC_URL = process.env.ZG_RPC_URL || 'https://evmrpc-testnet.0g.ai';
const ZG_PRIVATE_KEY = process.env.ZG_PRIVATE_KEY;
const ZG_INDEXER_RPC = process.env.ZG_INDEXER_RPC || 'https://indexer-storage-testnet-turbo.0g.ai';
const ZG_ENABLE_LOCAL_FALLBACK = (process.env.ZG_ENABLE_LOCAL_FALLBACK ?? 'true') === 'true';
const ZG_LOCAL_FALLBACK_PATH =
  process.env.ZG_LOCAL_FALLBACK_PATH ?? path.join(process.cwd(), '.cache', 'zg-memory-fallback.json');
const ZG_LOCAL_INDEX_PATH =
  process.env.ZG_LOCAL_INDEX_PATH ?? path.join(process.cwd(), '.cache', 'zg-storage-index.json');
type StorageMode = 'onchain_0g' | 'hybrid' | 'local_only';
const ZG_STORAGE_MODE = (process.env.ZG_STORAGE_MODE ?? 'hybrid') as StorageMode;

const ZG_CIRCUIT_BREAKER_THRESHOLD = Number(process.env.ZG_CIRCUIT_BREAKER_THRESHOLD ?? 3);
const ZG_CIRCUIT_BREAKER_COOLDOWN_MS = Number(process.env.ZG_CIRCUIT_BREAKER_COOLDOWN_MS ?? 300000);
const ZG_MIN_BALANCE_WEI = BigInt(process.env.ZG_MIN_BALANCE_WEI ?? '30000000000000000'); // 0.03 0G

const writeCircuitState: { consecutiveFailures: number; openUntil: number } = {
  consecutiveFailures: 0,
  openUntil: 0,
};

type SaveMemoryParams = {
  key: string;
  value: string;
  accessToken?: string | null;
  walletAddressOverride?: string | null;
  userIdOverride?: string | null;
};

type GetMemoryParams = {
  key: string;
  accessToken?: string | null;
  walletAddressOverride?: string | null;
  userIdOverride?: string | null;
};

export type ArchiveResult = {
  txHash: string | null;
  rootHash: string | null;
  error?: string | null;
  namespace?: string;
  userId?: string | null;
  backend?: '0g_file' | 'local_file';
};

type StorageIndex = {
  memory: Record<string, { rootHash: string; transactionHash: string | null; updatedAt: string }>;
};

type ReadMemoryResult = {
  status: 'memory_retrieved' | 'not_found' | 'memory_retrieved_fallback';
  key: string;
  namespace: string;
  userId: string | null;
  walletAddress: string;
  backend: '0g_file' | 'local_file' | 'none';
  value?: string;
  rootHash?: string;
  transactionHash?: string | null;
  warning?: string;
};

function sessionKeyFromAccessToken(accessToken?: string | null): string {
  if (!accessToken) return 'anonymous';
  const parts = accessToken.split('.');
  if (parts.length < 2) return accessToken;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8')) as {
      sub?: string;
      sid?: string;
    };
    return payload.sub ?? payload.sid ?? accessToken;
  } catch {
    return accessToken;
  }
}

function composeMemoryNamespace(address: string, userId?: string): string {
  const wallet = address.toLowerCase();
  const normalizedUserId = userId?.trim();
  if (!normalizedUserId) return wallet;
  return `privy:${normalizedUserId}:wallet:${wallet}`;
}

function indexMemoryKey(namespace: string, key: string): string {
  return `user:${namespace}:${key}`;
}

function extractTxHash(tx: unknown): string | null {
  if (typeof tx === 'string') return tx;
  if (typeof tx === 'object' && tx !== null) {
    const maybe = tx as { txHash?: string; transactionHash?: string; hash?: string };
    return maybe.txHash ?? maybe.transactionHash ?? maybe.hash ?? null;
  }
  return null;
}

function emptyIndex(): StorageIndex {
  return { memory: {} };
}

async function loadIndex(): Promise<StorageIndex> {
  try {
    const raw = await fs.readFile(ZG_LOCAL_INDEX_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as StorageIndex;
    if (parsed && typeof parsed === 'object' && parsed.memory && typeof parsed.memory === 'object') {
      return parsed;
    }
    return emptyIndex();
  } catch {
    return emptyIndex();
  }
}

async function saveIndex(index: StorageIndex): Promise<void> {
  await fs.mkdir(path.dirname(ZG_LOCAL_INDEX_PATH), { recursive: true });
  await fs.writeFile(ZG_LOCAL_INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8');
}

async function loadFallbackStore(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(ZG_LOCAL_FALLBACK_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, string>;
    return {};
  } catch {
    return {};
  }
}

async function writeFallback(namespace: string, key: string, value: string): Promise<void> {
  const store = await loadFallbackStore();
  store[indexMemoryKey(namespace, key)] = value;
  await fs.mkdir(path.dirname(ZG_LOCAL_FALLBACK_PATH), { recursive: true });
  await fs.writeFile(ZG_LOCAL_FALLBACK_PATH, JSON.stringify(store, null, 2), 'utf-8');
}

async function readFallback(
  namespace: string,
  key: string,
  legacyWalletNamespace?: string
): Promise<string | null> {
  const store = await loadFallbackStore();
  const primary = store[indexMemoryKey(namespace, key)];
  if (typeof primary === 'string') return primary;
  if (legacyWalletNamespace && legacyWalletNamespace !== namespace) {
    const legacy = store[indexMemoryKey(legacyWalletNamespace, key)];
    if (typeof legacy === 'string') return legacy;
  }
  return null;
}

function isCircuitOpenNow(): boolean {
  return Date.now() < writeCircuitState.openUntil;
}

function shouldAttemptOnchainWrite(): { shouldAttempt: boolean; reason?: string } {
  if (ZG_STORAGE_MODE === 'local_only') return { shouldAttempt: false, reason: 'storage_mode_local_only' };
  if (isCircuitOpenNow()) return { shouldAttempt: false, reason: 'circuit_breaker_open' };
  return { shouldAttempt: true };
}

function markOnchainWriteSuccess(): void {
  writeCircuitState.consecutiveFailures = 0;
  writeCircuitState.openUntil = 0;
}

function markOnchainWriteFailure(): void {
  writeCircuitState.consecutiveFailures += 1;
  if (writeCircuitState.consecutiveFailures >= ZG_CIRCUIT_BREAKER_THRESHOLD) {
    writeCircuitState.openUntil = Date.now() + ZG_CIRCUIT_BREAKER_COOLDOWN_MS;
  }
}

function getEthersSigner(): ethers.Wallet {
  if (!ZG_PRIVATE_KEY) {
    throw new Error('ZG_PRIVATE_KEY is not set. This wallet must hold 0G tokens for storage operations.');
  }
  const provider = new ethers.JsonRpcProvider(ZG_RPC_URL);
  return new ethers.Wallet(ZG_PRIVATE_KEY, provider);
}

async function uploadContentTo0g(content: string, namePrefix: string): Promise<{
  rootHash: string;
  transactionHash: string;
}> {
  const signer = getEthersSigner();
  const provider = signer.provider ?? new ethers.JsonRpcProvider(ZG_RPC_URL);
  const signerAddress = await signer.getAddress();
  const signerBalanceWei = await provider.getBalance(signerAddress);
  if (signerBalanceWei < ZG_MIN_BALANCE_WEI) {
    throw new Error(
      `Insufficient 0G signer balance for upload. Current=${ethers.formatEther(
        signerBalanceWei
      )} 0G, required_min=${ethers.formatEther(ZG_MIN_BALANCE_WEI)} 0G. ` +
        `Top up signer wallet ${signerAddress} on ${ZG_RPC_URL}.`
    );
  }

  const indexer = new Indexer(ZG_INDEXER_RPC);
  const tmpFile = path.join(os.tmpdir(), `${namePrefix}-${Date.now()}.json`);
  await fs.writeFile(tmpFile, content, 'utf-8');
  const file = await ZgFile.fromFilePath(tmpFile);

  try {
    const [tree, treeErr] = await file.merkleTree();
    if (treeErr !== null || !tree) {
      throw new Error(`Error computing Merkle tree: ${String(treeErr)}`);
    }
    const rootHash = tree.rootHash();
    if (!rootHash) throw new Error('Error computing Merkle root hash');

    const [tx, uploadErr] = await indexer.upload(file, ZG_RPC_URL, signer as any);
    if (uploadErr !== null) throw new Error(`Error uploading to 0G Storage: ${String(uploadErr)}`);
    const txHash = extractTxHash(tx);
    return { rootHash, transactionHash: txHash ?? '' };
  } finally {
    await file.close().catch(() => undefined);
    await fs.unlink(tmpFile).catch(() => undefined);
  }
}

async function downloadContentFrom0g(rootHash: string): Promise<string> {
  const indexer = new Indexer(ZG_INDEXER_RPC);
  const outputPath = path.join(os.tmpdir(), `0g-read-${Date.now()}.json`);
  const downloadErr = await indexer.download(rootHash, outputPath, true);
  if (downloadErr !== null) {
    throw new Error(`Error downloading from 0G Storage: ${String(downloadErr)}`);
  }
  const content = await fs.readFile(outputPath, 'utf-8');
  await fs.unlink(outputPath).catch(() => undefined);
  return content;
}

async function resolveNamespace(
  accessToken?: string | null,
  walletAddressOverride?: string | null,
  userIdOverride?: string | null
): Promise<{
  userId: string | null;
  walletAddress: string;
  namespace: string;
}> {
  const userId = userIdOverride ?? (accessToken ? sessionKeyFromAccessToken(accessToken) : null);
  let walletAddress = walletAddressOverride?.toLowerCase() ?? null;
  if (!walletAddress && accessToken) {
    try {
      walletAddress = (await getPrivyEvmWalletAddress(accessToken)).toLowerCase();
    } catch {
      walletAddress = null;
    }
  }
  const safeWallet = walletAddress ?? 'unknown_wallet';
  return {
    userId,
    walletAddress: safeWallet,
    namespace: composeMemoryNamespace(safeWallet, userId ?? undefined),
  };
}

export async function saveUserMemory(params: SaveMemoryParams): Promise<ArchiveResult> {
  const { key, value, accessToken, walletAddressOverride, userIdOverride } = params;
  const { userId, walletAddress, namespace } = await resolveNamespace(
    accessToken,
    walletAddressOverride,
    userIdOverride
  );
  const attemptDecision = shouldAttemptOnchainWrite();

  try {
    if (!attemptDecision.shouldAttempt) {
      throw new Error(`0G write skipped: ${attemptDecision.reason}`);
    }

    const payload = JSON.stringify(
      {
        kind: 'memory',
        namespace,
        userId,
        walletAddress,
        key,
        value,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    );

    const { rootHash, transactionHash } = await uploadContentTo0g(payload, `0g-memory-${walletAddress}-${key}`);
    markOnchainWriteSuccess();

    const index = await loadIndex();
    index.memory[indexMemoryKey(namespace, key)] = {
      rootHash,
      transactionHash,
      updatedAt: new Date().toISOString(),
    };
    await saveIndex(index);

    return {
      txHash: transactionHash,
      rootHash,
      namespace,
      userId,
      backend: '0g_file',
      error: null,
    };
  } catch (err: any) {
    markOnchainWriteFailure();
    if (ZG_ENABLE_LOCAL_FALLBACK) {
      await writeFallback(namespace, key, value);
      return {
        txHash: null,
        rootHash: null,
        namespace,
        userId,
        backend: 'local_file',
        error: `0G write failed: ${err?.message ?? String(err)}`,
      };
    }
    return {
      txHash: null,
      rootHash: null,
      namespace,
      userId,
      error: err?.message ?? String(err),
    };
  }
}

export async function getUserMemory(params: GetMemoryParams): Promise<ReadMemoryResult> {
  const { key, accessToken, walletAddressOverride, userIdOverride } = params;
  const { userId, walletAddress, namespace } = await resolveNamespace(
    accessToken,
    walletAddressOverride,
    userIdOverride
  );

  try {
    if (ZG_STORAGE_MODE === 'local_only') {
      const fallbackOnly = await readFallback(namespace, key, walletAddress);
      if (typeof fallbackOnly === 'string') {
        return {
          status: 'memory_retrieved',
          key,
          namespace,
          userId,
          walletAddress,
          backend: 'local_file',
          value: fallbackOnly,
        };
      }
      return { status: 'not_found', key, namespace, userId, walletAddress, backend: 'none' };
    }

    const index = await loadIndex();
    const entry = index.memory[indexMemoryKey(namespace, key)] ?? index.memory[indexMemoryKey(walletAddress, key)];
    if (!entry) {
      const fallbackValue = await readFallback(namespace, key, walletAddress);
      if (typeof fallbackValue === 'string') {
        return {
          status: 'memory_retrieved_fallback',
          key,
          namespace,
          userId,
          walletAddress,
          backend: 'local_file',
          value: fallbackValue,
        };
      }
      return { status: 'not_found', key, namespace, userId, walletAddress, backend: 'none' };
    }

    const raw = await downloadContentFrom0g(entry.rootHash);
    let value = raw;
    try {
      const parsed = JSON.parse(raw) as { value?: string };
      if (typeof parsed.value === 'string') value = parsed.value;
    } catch {
      // Keep raw for compatibility if file format changes.
    }

    return {
      status: 'memory_retrieved',
      key,
      namespace,
      userId,
      walletAddress,
      backend: '0g_file',
      value,
      rootHash: entry.rootHash,
      transactionHash: entry.transactionHash ?? null,
    };
  } catch (err: any) {
    const fallbackValue = await readFallback(namespace, key, walletAddress);
    if (typeof fallbackValue === 'string') {
      return {
        status: 'memory_retrieved_fallback',
        key,
        namespace,
        userId,
        walletAddress,
        backend: 'local_file',
        value: fallbackValue,
        warning: `0G file read failed: ${err?.message ?? String(err)}`,
      };
    }
    return {
      status: 'not_found',
      key,
      namespace,
      userId,
      walletAddress,
      backend: 'none',
      warning: err?.message ?? String(err),
    };
  }
}

export async function archiveTo0g(payload: object): Promise<ArchiveResult> {
  const serialized = JSON.stringify(payload ?? {});
  return saveUserMemory({
    key: 'chat_summary_latest',
    value: serialized,
    accessToken: undefined,
    walletAddressOverride: 'legacy_archive',
  });
}

export function parseMemoryValue(value?: string): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function compactMemoryForPrompt(memory: Record<string, unknown>): Record<string, unknown> {
  const turns = Array.isArray(memory.recentTurns)
    ? memory.recentTurns
        .filter((t) => t && typeof t === 'object')
        .slice(-2)
        .map((t) => {
          const turn = t as Record<string, unknown>;
          return {
            userMessage: typeof turn.userMessage === 'string' ? turn.userMessage.slice(0, 160) : null,
            assistantReply: typeof turn.assistantReply === 'string' ? turn.assistantReply.slice(0, 220) : null,
            hadSwapExecution: typeof turn.hadSwapExecution === 'boolean' ? turn.hadSwapExecution : null,
            updatedAt: typeof turn.updatedAt === 'string' ? turn.updatedAt : null,
          };
        })
    : [];

  const swapContext = memory.swapContext && typeof memory.swapContext === 'object'
    ? (memory.swapContext as Record<string, unknown>)
    : null;

  return {
    schemaVersion: typeof memory.schemaVersion === 'string' ? memory.schemaVersion : null,
    updatedAt: typeof memory.updatedAt === 'string' ? memory.updatedAt : null,
    recentTurns: turns,
    swapContext: swapContext
      ? {
          lastSwapPair: typeof swapContext.lastSwapPair === 'string' ? swapContext.lastSwapPair : null,
          lastSwapAmount:
            typeof swapContext.lastSwapAmount === 'string' || typeof swapContext.lastSwapAmount === 'number'
              ? swapContext.lastSwapAmount
              : null,
          lastSwapTxHash: typeof swapContext.lastSwapTxHash === 'string' ? swapContext.lastSwapTxHash : null,
        }
      : null,
  };
}
