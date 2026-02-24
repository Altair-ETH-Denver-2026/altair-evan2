'use client';

import { VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets, useSignAndSendTransaction } from '@privy-io/react-auth/solana';
import { resolveSelectedChain } from './useSwap';
import type { ChainKey } from '../../config/blockchain_config';

/**
 * Hook to execute a swap on Solana mainnet via Jupiter Swap API.
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

    const routeResponse = await fetch('/api/test-swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        chain: 'SOLANA_MAINNET',
        sellToken: sellToken.toUpperCase(),
        buyToken: buyToken.toUpperCase(),
        amount: sellAmount,
        recipient: wallet.address,
      }),
    });

    if (!routeResponse.ok) {
      const errPayload = await routeResponse.json().catch(() => ({}));
      throw new Error((errPayload as { error?: string })?.error ?? 'Failed to fetch Solana swap quote');
    }

    const payload = (await routeResponse.json()) as {
      solana?: { swapTransaction?: string; rpcUrl?: string };
    };

    const swapTransactionBase64 = payload?.solana?.swapTransaction;
    if (!swapTransactionBase64) {
      throw new Error('No swap transaction returned from Jupiter.');
    }

    const txBuffer = Buffer.from(swapTransactionBase64, 'base64');
    const versionedTx = VersionedTransaction.deserialize(txBuffer);
    const serialized = versionedTx.serialize();

    try {
      const { signature } = await signAndSendTransaction({
        transaction: serialized,
        wallet,
        chain: 'solana:mainnet',
      });

      const sigBase58 =
        typeof signature === 'string' ? signature : bs58.encode(signature);
      return sigBase58;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('403') || msg.includes('HTTP error (403)')) {
        throw new Error(
          'Solana RPC returned 403 (rate limit). Use a custom RPC: set NEXT_PUBLIC_SOLANA_RPC_URL in .env to a free RPC (e.g. Helius: https://www.helius.dev, QuickNode, Alchemy) and restart the dev server.'
        );
      }
      throw err;
    }
  };
}
