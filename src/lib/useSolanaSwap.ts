'use client';

import {
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets, useSignAndSendTransaction } from '@privy-io/react-auth/solana';
import { resolveSelectedChain } from './useSwap';
import type { ChainKey } from '../../config/blockchain_config';
import { SOLANA_MAINNET } from '../../config/solana_config';

/** 0x Solana API instruction shape (from swap-instructions response). */
interface ZeroExInstruction {
  program_id: number[];
  accounts: { pubkey: number[]; is_signer: boolean; is_writable: boolean }[];
  data: number[];
}

function decodePubkey(bytes: number[]): PublicKey {
  return new PublicKey(Uint8Array.from(bytes));
}

function buildInstructions(instructionsData: ZeroExInstruction[]): TransactionInstruction[] {
  return instructionsData.map((ix) => ({
    keys: ix.accounts.map((acc) => ({
      pubkey: decodePubkey(acc.pubkey),
      isSigner: acc.is_signer,
      isWritable: acc.is_writable,
    })),
    programId: decodePubkey(ix.program_id),
    data: Buffer.from(ix.data),
  }));
}

/**
 * Hook to execute a swap on Solana mainnet via 0x swap-instructions.
 * Returns (sellToken, sellAmount, buyToken) => Promise<signature string>.
 * Use when selected chain is SOLANA_MAINNET.
 */
export function useSolanaSwap(explicitChain?: ChainKey) {
  const { authenticated } = usePrivy();
  const { wallets, ready } = useWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();

  return async (sellToken: string, sellAmount: string, buyToken: string): Promise<string> => {
    if (!authenticated || !ready || !wallets?.length) {
      throw new Error('No authenticated Solana wallet available. Connect a Solana wallet in the app.');
    }

    const selectedChain = resolveSelectedChain(explicitChain);
    if (selectedChain !== 'SOLANA_MAINNET') {
      throw new Error('useSolanaSwap is for Solana only. Selected chain is not SOLANA_MAINNET.');
    }

    const wallet = wallets[0];
    const takerAddress = wallet.address;

    const routeResponse = await fetch('/api/test-swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        chain: 'SOLANA_MAINNET',
        sellToken: sellToken.toUpperCase(),
        buyToken: buyToken.toUpperCase(),
        amount: sellAmount,
        recipient: takerAddress,
      }),
    });

    if (!routeResponse.ok) {
      const errPayload = await routeResponse.json().catch(() => ({}));
      throw new Error((errPayload as { error?: string })?.error ?? 'Failed to fetch Solana swap quote');
    }

    const payload = (await routeResponse.json()) as {
      solana?: { instructions?: ZeroExInstruction[]; rpcUrl?: string };
    };

    if (!payload?.solana?.instructions?.length) {
      throw new Error('No swap instructions returned from 0x.');
    }

    const rpcUrl = payload.solana.rpcUrl ?? SOLANA_MAINNET.rpcUrl;
    const connection = new Connection(rpcUrl);

    const instructions = buildInstructions(payload.solana.instructions);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

    const message = new TransactionMessage({
      payerKey: new PublicKey(takerAddress),
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();

    const versionedTx = new VersionedTransaction(message);
    const serialized = versionedTx.serialize();

    const { signature } = await signAndSendTransaction({
      transaction: serialized,
      wallet,
      chain: 'solana:mainnet',
    });

    // Privy returns signature as Uint8Array; convert to base58 for Solana explorers.
    const sigBase58 =
      typeof signature === 'string' ? signature : bs58.encode(signature);
    return sigBase58;
  };
}
