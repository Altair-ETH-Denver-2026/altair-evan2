/**
 * Server-side helper to fetch the authenticated user's wallet balance for a given chain.
 * Used by the chat API to inject balance context so the AI can answer "what's my balance?" and "sell all X".
 */
import { createPublicClient, http, formatEther, formatUnits } from 'viem';
import { baseSepolia } from 'viem/chains';
import { Connection, PublicKey } from '@solana/web3.js';
import { BLOCKCHAIN, CHAINS, isSolanaChain, type ChainKey, type EvmChainKey } from '../../config/blockchain_config';
import { ARBITRUM_ONE, BASE_MAINNET, BASE_SEPOLIA, ETH_MAINNET, ETH_SEPOLIA, resolveRpcUrls } from '../../config/chain_info';
import { SOLANA_MAINNET } from '../../config/solana_config';
import { SOLANA_MAINNET_TOKENS, SOLANA_WALLET_DISPLAY_SYMBOLS } from '../../config/token_info/solana_tokens';
import { USDC as BASE_USDC, WETH as BASE_WETH } from '../../config/token_info/base_tokens';
import { USDC as BASE_SEPOLIA_USDC, WETH as BASE_SEPOLIA_WETH } from '../../config/token_info/base_testnet_sepolia_tokens';
import { USDC as ETH_USDC, WETH as ETH_WETH } from '../../config/token_info/eth_tokens';
import { USDC as ETH_SEPOLIA_USDC, WETH as ETH_SEPOLIA_WETH } from '../../config/token_info/eth_sepolia_testnet_tokens';
import { USDC as ARBITRUM_USDC, WETH as ARBITRUM_WETH } from '../../config/token_info/arbitrum_tokens';
import { getPrivyEvmWalletAddress, getPrivySolanaWalletAddress } from '@/lib/privy';

const USDC_ABI = [
  { name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const;

export type BalanceResult = Record<string, string>;

/**
 * Fetches the user's wallet balance for the given chain using their Privy access token.
 * Returns null if not authenticated or fetch fails.
 */
export async function fetchUserBalanceForChain(
  accessToken: string | null,
  chainKey: ChainKey
): Promise<BalanceResult | null> {
  if (!accessToken?.trim()) return null;

  const resolvedChainKey: ChainKey = chainKey && chainKey in CHAINS ? chainKey : (BLOCKCHAIN as ChainKey);

  try {
    if (isSolanaChain(resolvedChainKey)) {
      const solanaAddress = await getPrivySolanaWalletAddress(accessToken);
      if (!solanaAddress) return null;
      const connection = new Connection(SOLANA_MAINNET.rpcUrl);
      const pubkey = new PublicKey(solanaAddress);
      const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
      const [solLamports, tokenAccountsRes] = await Promise.all([
        connection.getBalance(pubkey),
        connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID }),
      ]);
      const solBalance = (solLamports / 1e9).toFixed(9);
      const mintToBalance: Record<string, string> = {};
      for (const { account } of tokenAccountsRes.value) {
        const info = account.data?.parsed?.info;
        const mint = info?.mint as string | undefined;
        const uiAmount = info?.tokenAmount?.uiAmount;
        if (mint && uiAmount != null) mintToBalance[mint] = String(uiAmount);
      }
      const out: BalanceResult = {
        address: solanaAddress,
        SOL: solBalance,
        USDC: mintToBalance[SOLANA_MAINNET_TOKENS.USDC.address] ?? '0',
      };
      for (const sym of SOLANA_WALLET_DISPLAY_SYMBOLS) {
        if (sym === 'SOL' || sym === 'USDC') continue;
        const token = SOLANA_MAINNET_TOKENS[sym];
        if (token) out[sym] = mintToBalance[token.address] ?? '0';
      }
      return out;
    }

    const addressToQuery = await getPrivyEvmWalletAddress(accessToken) as `0x${string}` | null;
    if (!addressToQuery) return null;

    const chainConfigs = { BASE_SEPOLIA, ETH_SEPOLIA, ETH_MAINNET, BASE_MAINNET, ARBITRUM_ONE } as const;
    const evmChainKey = resolvedChainKey as EvmChainKey;
    const chainConfig = chainConfigs[evmChainKey];
    const resolvedRpcUrls = resolveRpcUrls(chainConfig.rpcUrls);
    const primaryRpcUrl = resolvedRpcUrls[0];
    const tokenConfigs = {
      BASE_SEPOLIA: { USDC: BASE_SEPOLIA_USDC, WETH: BASE_SEPOLIA_WETH },
      ETH_SEPOLIA: { USDC: ETH_SEPOLIA_USDC, WETH: ETH_SEPOLIA_WETH },
      ETH_MAINNET: { USDC: ETH_USDC, WETH: ETH_WETH },
      BASE_MAINNET: { USDC: BASE_USDC, WETH: BASE_WETH },
      ARBITRUM_ONE: { USDC: ARBITRUM_USDC, WETH: ARBITRUM_WETH },
    } as const;
    const tokenConfig = tokenConfigs[evmChainKey];
    const client = createPublicClient({
      chain: { ...baseSepolia, id: chainConfig.chainId, rpcUrls: { default: { http: resolvedRpcUrls }, public: { http: resolvedRpcUrls } } },
      transport: http(primaryRpcUrl),
    });

    const ethBalanceRaw = await client.getBalance({ address: addressToQuery });
    const eth = formatEther(ethBalanceRaw);
    let usdc = '0';
    const usdcAddress = tokenConfig?.USDC?.address;
    if (usdcAddress) {
      try {
        const [decimals, usdcBalanceRaw] = await Promise.all([
          client.readContract({ address: usdcAddress as `0x${string}`, abi: USDC_ABI, functionName: 'decimals' }),
          client.readContract({ address: usdcAddress as `0x${string}`, abi: USDC_ABI, functionName: 'balanceOf', args: [addressToQuery] }),
        ]);
        usdc = formatUnits(usdcBalanceRaw, Number(decimals));
      } catch {
        usdc = '0';
      }
    }

    return { address: addressToQuery, ETH: eth, USDC: usdc };
  } catch (err) {
    console.warn('[fetchUserBalanceForChain]', resolvedChainKey, err);
    return null;
  }
}
