import { Indexer, ZgFile } from '@0glabs/0g-ts-sdk';
import { JsonRpcProvider, Wallet, Contract } from 'ethers';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const extra_logs = false;

const RPC_URL = process.env.ZEROG_RPC_URL ?? 'https://evmrpc-testnet.0g.ai/';
const INDEXER_RPC = process.env.ZEROG_INDEXER_URL ?? 'https://indexer-storage-testnet-turbo.0g.ai';
// Optional override; if unset we apply a generous default to avoid underpricing reverts
// Fee is delegated to the SDK's dynamic calculation (market.pricePerSector * sectors).
// We keep the env var only for logging; it is NOT enforced to avoid require(false) reverts.
const STORAGE_FEE_WEI = process.env.ZEROG_STORAGE_FEE_WEI;
const FLOW_ADDRESS = (process.env.ZEROG_FLOW_ADDRESS ?? '0x22e03a6a89b950f1c82ec5e74f8eca321a105296').toLowerCase();

const PRICE_PER_SECTOR_ABI = [
  {
    inputs: [],
    name: 'pricePerSector',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];

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
    return { txHash: null, rootHash: null };
  }

  let tempFilePath: string | null = null;

  try {
    const provider = new JsonRpcProvider(RPC_URL);
    // Cast to any because the 0g SDK expects the CommonJS Signer shape
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const signer = new Wallet(privateKey, provider) as any;
    const indexer = new Indexer(INDEXER_RPC);

    const balance = await provider.getBalance(await signer.getAddress());
    const balanceWei = BigInt(balance.toString());
    console.log('[0G] Signer balance (wei):', balanceWei.toString());

    let pricePerSector: bigint | null = null;
    try {
      const flowContract = new Contract(FLOW_ADDRESS, PRICE_PER_SECTOR_ABI, provider);
      const pps = await flowContract.pricePerSector();
      pricePerSector = BigInt(pps.toString());
      console.log('[0G] pricePerSector (wei):', pricePerSector.toString());
    } catch (err) {
      console.warn('[0G] Failed to read pricePerSector; using fee override only');
    }

    const content = JSON.stringify(payload ?? {}, null, 2) ?? '';
    console.log('[0G] Payload length (chars):', content.length);
    console.log('[0G] Payload preview:', content.slice(0, 200));
    if (content.length === 0) {
      throw new Error('0G payload is empty; nothing to archive');
    }
    tempFilePath = await createTempJsonFile(content);

    if (extra_logs) {console.log('content', content);}

    // Build ZgFile from file path (supported by SDK)
    const fileStats = await stat(tempFilePath);
    console.log('[0G] Temp file path:', tempFilePath, 'size(bytes):', fileStats.size);
    if (fileStats.size === 0) {
      throw new Error('0G temp file is empty after write');
    }

    const file = await ZgFile.fromFilePath(tempFilePath);

    // Generate Merkle tree for verification
    const [tree, treeErr] = await file.merkleTree();
    if (treeErr) throw new Error(`Merkle tree error: ${treeErr}`);
    const rootHash = tree?.rootHash() ?? null;

    // Do not set fee manually; let SDK calculate based on pricePerSector.
    if (STORAGE_FEE_WEI) {
      console.log('[0G] STORAGE_FEE_WEI provided but ignored (SDK will auto-calc fee)');
    }

    const uploadOpts = {
      fee: BigInt(0), // trigger SDK dynamic pricing
      tags: '0x',
      finalityRequired: false,
      taskSize: 1,
      expectedReplica: 1,
      skipTx: false,
    } as const;

    if (extra_logs) {console.log('file', file);}
    console.log('Attempting on-chain upload via 0G indexer');
    const [uploadResult, uploadErr] = await indexer.upload(
      file,
      RPC_URL,
      signer,
      uploadOpts,
    );
    await file.close?.();

    if (uploadErr) {
      const errMsg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
      console.error('0g upload error:', errMsg);
      return {
        txHash: null,
        rootHash,
        error: errMsg,
      };
    }

    return {
      txHash: uploadResult?.txHash ?? null,
      rootHash: uploadResult?.rootHash ?? rootHash,
      error: null,
    };
  } catch (e) {
    console.error('0g Archival failed:', e);
    const errMsg = e instanceof Error ? e.message : String(e);
    return { txHash: null, rootHash: null, error: errMsg };
  } finally {
    if (tempFilePath) {
      await unlink(tempFilePath).catch(() => {});
    }
  }
}
