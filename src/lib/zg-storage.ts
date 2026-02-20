import { Indexer, ZgFile } from '@0glabs/0g-ts-sdk';
import { JsonRpcProvider, Wallet } from 'ethers';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const extra_logs = false;


const RPC_URL = process.env.ZEROG_RPC_URL ?? 'https://evmrpc-testnet.0g.ai';

const INDEXER_RPC = process.env.ZEROG_INDEXER_URL ?? 'https://indexer-storage-testnet-turbo.0g.ai';

export type ArchiveResult = {
  txHash: string | null;
  rootHash: string | null;
  error?: string | null;
};

async function createTempJsonFile(content: string) {
  const dir = join(process.cwd(), 'src', 'temp');
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, `chat-${randomUUID()}.json`);
  await writeFile(filePath, content, 'utf8');
  return filePath;
}

export async function archiveTo0g(payload: object): Promise<ArchiveResult> {
  const privateKey = process.env.ZEROG_BASE_PRIVATE_KEY;
  if (!privateKey) {
    console.error('Missing ZEROG_BASE_PRIVATE_KEY environment variable');
    return { txHash: null, rootHash: null, error: 'Missing private key' };
  }

  let tempFilePath: string | null = null;

  try {
    // Provider + signer exactly like docs/starter kit
    const provider = new JsonRpcProvider(RPC_URL);
    const signer = new Wallet(privateKey, provider) as any;

    // Basic sanity logs
    const network = await provider.getNetwork();
    console.log('[0G] Connected chainId:', network.chainId.toString());
    console.log('[0G] RPC_URL:', RPC_URL);
    console.log('[0G] INDEXER_RPC:', INDEXER_RPC);

    const addr = await signer.getAddress();
    const balance = await provider.getBalance(addr);
    console.log('[0G] Signer address:', addr);
    console.log('[0G] Signer balance (wei):', balance.toString());

    const content = JSON.stringify(payload ?? {}, null, 2) ?? '';
    console.log('[0G] Payload length (chars):', content.length);
    console.log('[0G] Payload preview:', content.slice(0, 200));

    if (content.length === 0) {
      throw new Error('0G payload is empty; nothing to archive');
    }

    tempFilePath = await createTempJsonFile(content);

    const fileStats = await stat(tempFilePath);
    console.log('[0G] Temp file path:', tempFilePath, 'size(bytes):', fileStats.size);
    if (fileStats.size === 0) {
      throw new Error('0G temp file is empty after write');
    }

    // Create ZgFile + merkle (docs/starter kit pattern)
    const file = await ZgFile.fromFilePath(tempFilePath);

    const [tree, treeErr] = await file.merkleTree();
    if (treeErr !== null) {
      throw new Error(`Error generating Merkle tree: ${treeErr}`);
    }

    const rootHash = tree?.rootHash?.() ?? (tree as any)?.rootHash?.() ?? null;
    console.log('[0G] File Root Hash:', rootHash);

    if (extra_logs) {
      console.log('[0G] RPC + indexer upload starting (no custom opts)');
    }

    // ✅ THE DOCS/STATER-KIT CALL: no custom opts/fee overrides
    const indexer = new Indexer(INDEXER_RPC);
    const [tx, uploadErr] = await indexer.upload(file, RPC_URL, signer);
    await file.close?.();

    if (uploadErr !== null) {
      const errMsg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
      console.error('[0G] Upload error:', errMsg);
      return { txHash: null, rootHash, error: errMsg };
    }

    // Starter kit shows tx.rootHash and tx.txHash
    const txHash =
      (tx as any)?.txHash ??
      (tx as any)?.hash ??
      (typeof tx === 'string' ? tx : null);

    const returnedRoot =
      (tx as any)?.rootHash ?? rootHash;

    console.log('[0G] Upload successful! txHash:', txHash, 'rootHash:', returnedRoot);

    return {
      txHash: txHash ?? null,
      rootHash: returnedRoot ?? null,
      error: null,
    };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error('[0G] Archival failed:', errMsg);
    return { txHash: null, rootHash: null, error: errMsg };
  } finally {
    if (tempFilePath) {
      await unlink(tempFilePath).catch(() => {});
    }
  }
}