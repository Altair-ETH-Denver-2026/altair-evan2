import { ethers } from 'ethers';

export type ArchiveResult = {
  txHash: string | null;
  rootHash: string | null;
  error?: string | null;
};
export async function archiveTo0g(payload: object): Promise<ArchiveResult> {
  console.log('[Archive] Skipping 0G archival. Payload length:', JSON.stringify(payload ?? {}).length);
  return { txHash: null, rootHash: null, error: '0G archival disabled' };
}
