import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { parseEther, encodeFunctionData, isAddress, hexToBigInt } from 'viem';
import { PrivyWalletProvider } from '@coinbase/agentkit';
import { ensurePrivyEmbeddedEvmWallet } from '@/lib/privy';
import { ACTIVE_CHAIN } from '../../../../config';

const ETH_TO_SWAP = '0.00001';
const {
  chainId: BASE_SEPOLIA_CHAIN_ID,
  rpcUrl: BASE_SEPOLIA_RPC_URL,
  weth: WETH_BASE_SEPOLIA,
  usdc: USDC_BASE_SEPOLIA,
} = ACTIVE_CHAIN;
const UNISWAP_QUOTE_URL = 'https://api.uniswap.org/v1/quote';
const ZEROX_QUOTE_URL = 'https://base-sepolia.api.0x.org/swap/v1/quote';

const erc20Abi = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
];

const wethAbi = [
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'payable',
    inputs: [],
    outputs: [],
  },
];

export async function POST(req: Request) {
  try {
    const { accessToken: bodyToken } = await req.json().catch(() => ({ accessToken: null }));

    // Prefer signed Privy token (ID/Auth) from HTTP-only cookie, else fall back to body token (same as balances flow)
    const cookieStore = await cookies();
    const cookieToken = cookieStore.get('privy-token')?.value;
    console.log('[Test Swap] cookie privy-token present:', !!cookieToken, 'len:', cookieToken?.length ?? 0);
    console.log('[Test Swap] body accessToken present:', !!bodyToken, 'len:', bodyToken?.length ?? 0);

    const tokenToVerify = cookieToken ?? bodyToken;

    if (!tokenToVerify) {
      return NextResponse.json({ error: 'Missing Privy token' }, { status: 401 });
    }

    // Resolve or create a Privy-controlled embedded EVM wallet (server-signable)
    const { walletId, address: walletAddress } = await ensurePrivyEmbeddedEvmWallet(tokenToVerify);

    if (!process.env.UNISWAP_API_KEY) {
      return NextResponse.json({ error: 'Missing UNISWAP_API_KEY env var' }, { status: 500 });
    }

    // Configure Privy wallet provider directly for signing
    const walletProvider = await PrivyWalletProvider.configureWithWallet({
      appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? process.env.PRIVY_APP_ID ?? '',
      appSecret: process.env.PRIVY_APP_SECRET ?? '',
      chainId: String(BASE_SEPOLIA_CHAIN_ID),
      rpcUrl: BASE_SEPOLIA_RPC_URL,
      walletId,
    });

    // const publicClient = walletProvider.getPublicClient();

    // Build Uniswap quote request (WETH -> USDC on Base Sepolia)
    const sellAmountWei = parseEther(ETH_TO_SWAP).toString();
    const quoteBody = {
      chainId: BASE_SEPOLIA_CHAIN_ID,
      sellToken: WETH_BASE_SEPOLIA,
      buyToken: USDC_BASE_SEPOLIA,
      sellAmount: sellAmountWei,
      slippageTolerance: '0.01', // 1%
      recipient: walletAddress,
      deadline: Math.floor(Date.now() / 1000 + 15 * 60).toString(),
    };

    const sendQuotedTx = async (
      tx: {
        to: string;
        data: string;
        value?: string;
        gas?: string;
        gasPrice?: string;
        maxFeePerGas?: string;
        maxPriorityFeePerGas?: string;
      },
      allowanceTarget?: string,
      opts?: { skipApproval?: boolean },
    ) => {
      const toBigIntFromHexOrDec = (v?: string) => {
        if (!v) return undefined;
        return v.startsWith('0x') ? hexToBigInt(v as `0x${string}`) : BigInt(v);
      };

      if (!opts?.skipApproval && allowanceTarget && isAddress(allowanceTarget)) {
        const approveData = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [allowanceTarget as `0x${string}`, BigInt(sellAmountWei)],
        });

        console.log('[Test Swap] sending approval to', allowanceTarget);
        const approveHash = await walletProvider.sendTransaction({
          to: WETH_BASE_SEPOLIA as `0x${string}`,
          data: approveData,
          value: 0n,
        });
        console.log('[Test Swap] approval tx hash:', approveHash);
        await walletProvider.waitForTransactionReceipt(approveHash as `0x${string}`);
      }

      const maxFeePerGas = toBigIntFromHexOrDec(tx.maxFeePerGas);
      const maxPriorityFeePerGas = toBigIntFromHexOrDec(tx.maxPriorityFeePerGas);
      const gasPriceAs1559 = !maxFeePerGas && !maxPriorityFeePerGas ? toBigIntFromHexOrDec(tx.gasPrice) : undefined;

      const txHash = await walletProvider.sendTransaction({
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}`,
        value: tx.value ? toBigIntFromHexOrDec(tx.value) ?? 0n : 0n,
        gas: toBigIntFromHexOrDec(tx.gas),
        // Use EIP-1559 fee fields; map legacy gasPrice to both fields if provided
        maxFeePerGas: maxFeePerGas ?? gasPriceAs1559,
        maxPriorityFeePerGas: maxPriorityFeePerGas ?? gasPriceAs1559,
      });

      console.log('[Test Swap] swap tx hash:', txHash);
      return txHash;
    };

    let txHash: string | undefined;
    let quoteId: string | undefined;
    let wrappedEth = false;

    // Try Uniswap first
    try {
      const quoteRes = await fetch(UNISWAP_QUOTE_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': process.env.UNISWAP_API_KEY,
        },
        body: JSON.stringify(quoteBody),
      });

      if (!quoteRes.ok) {
        const text = await quoteRes.text();
        throw new Error(`Uniswap quote failed: ${quoteRes.status} ${quoteRes.statusText} - ${text}`);
      }

      const quote = (await quoteRes.json()) as {
        requestId?: string;
        allowanceTarget?: string;
        tx?: {
          to: string;
          data: string;
          value?: string;
          gas?: string;
          gasPrice?: string;
          maxFeePerGas?: string;
          maxPriorityFeePerGas?: string;
        };
      };

      console.log('[Test Swap] Uniswap quote:', quote.requestId ?? 'no-request-id');
      if (!quote.tx) throw new Error('Uniswap quote missing tx payload');

      // Wrap native ETH into WETH before swapping (Uniswap endpoint expects ERC20 input)
      const wrapValue = parseEther(ETH_TO_SWAP);
      const depositData = encodeFunctionData({ abi: wethAbi, functionName: 'deposit' });
      console.log('[Test Swap] wrapping ETH to WETH');
      const wrapHash = await walletProvider.sendTransaction({
        to: WETH_BASE_SEPOLIA as `0x${string}`,
        data: depositData,
        value: wrapValue,
      });
      await walletProvider.waitForTransactionReceipt(wrapHash as `0x${string}`);
      wrappedEth = true;

      txHash = await sendQuotedTx(quote.tx, quote.allowanceTarget);
      quoteId = quote.requestId;
    } catch (uniErr) {
      console.warn('[Test Swap] Uniswap failed, falling back to 0x:', uniErr);

      if (!process.env.ZEROX_API_KEY) {
        throw new Error('Missing ZEROX_API_KEY for 0x fallback');
      }

      const params = new URLSearchParams({
        sellToken: wrappedEth ? WETH_BASE_SEPOLIA : 'ETH',
        buyToken: USDC_BASE_SEPOLIA,
        sellAmount: sellAmountWei,
        slippagePercentage: '0.01',
      });

      const oxRes = await fetch(`${ZEROX_QUOTE_URL}?${params.toString()}`, {
        headers: {
          '0x-api-key': process.env.ZEROX_API_KEY,
        },
      });

      if (!oxRes.ok) {
        const text = await oxRes.text();
        throw new Error(`0x quote failed: ${oxRes.status} ${oxRes.statusText} - ${text}`);
      }

      const oxQuote = (await oxRes.json()) as {
        allowanceTarget?: string;
        to: string;
        data: string;
        value?: string;
        gas?: string;
        gasPrice?: string;
        maxFeePerGas?: string;
        maxPriorityFeePerGas?: string;
      };

      console.log('[Test Swap] 0x quote received');
      txHash = await sendQuotedTx(
        {
          to: oxQuote.to,
          data: oxQuote.data,
          value: oxQuote.value,
          gas: oxQuote.gas,
          gasPrice: oxQuote.gasPrice,
          maxFeePerGas: oxQuote.maxFeePerGas,
          maxPriorityFeePerGas: oxQuote.maxPriorityFeePerGas,
        },
        oxQuote.allowanceTarget,
        wrappedEth ? undefined : { skipApproval: true },
      );
      quoteId = '0x-fallback';
    }

    console.log('[Test Swap] swap tx hash:', txHash);
    return NextResponse.json({ ok: true, txHash, quoteId });
  } catch (error) {
    console.error('Test swap error:', error);
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
