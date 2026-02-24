'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { SpinningLogo } from './SpinningLogo';
import { ShieldCheck, Send, Loader2 } from 'lucide-react';
import Logo from '../image/logo.png';
import { usePrivy } from '@privy-io/react-auth';
import { useSwap } from '../lib/useSwap';
import { CHAT_PANEL } from '../../config/ui_config';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  zgHash?: string | null;
  zgError?: string | null;
}

interface SwapIntent {
  type: 'SWAP_INTENT';
  sell: string;
  buy: string;
  amount: number | string;
}

export default function Chat() {
  const { authenticated, getAccessToken } = usePrivy();
  const executeSwap = useSwap();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExecutingSwap, setIsExecutingSwap] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const extractSwapIntent = (text: string): SwapIntent | null => {
    const trimmed = text.trim();
    const parseCandidate = (candidate: string) => {
      try {
        return JSON.parse(candidate) as SwapIntent;
      } catch {
        return null;
      }
    };

    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return parseCandidate(trimmed);
    }

    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return parseCandidate(trimmed.slice(firstBrace, lastBrace + 1));
    }

    // JSON inside markdown code block (e.g. ```json ... ```)
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      const inner = codeBlockMatch[1].trim();
      const innerFirst = inner.indexOf('{');
      const innerLast = inner.lastIndexOf('}');
      if (innerFirst >= 0 && innerLast > innerFirst) {
        return parseCandidate(inner.slice(innerFirst, innerLast + 1));
      }
    }

    return null;
  };


  const SUPPORTED_SELL = ['ETH', 'WETH', 'USDC', 'USDT', 'DAI'];
  const SUPPORTED_BUY = ['ETH', 'WETH', 'USDC', 'USDT', 'DAI'];

  const maybeExecuteSwapIntent = async (aiResponse: string): Promise<{ message: string; txHash?: string; chain?: string; sellToken?: string; buyToken?: string; amount?: string } | null> => {
    const intent = extractSwapIntent(aiResponse);
    if (!intent || intent.type !== 'SWAP_INTENT') return null;

    const sell = intent.sell?.toUpperCase();
    const buy = intent.buy?.toUpperCase();
    const amount = typeof intent.amount === 'number' ? intent.amount.toString() : intent.amount;

    if (!amount || Number(amount) <= 0 || !sell || !buy) {
      return null;
    }
    if (!SUPPORTED_SELL.includes(sell) || !SUPPORTED_BUY.includes(buy)) {
      return null;
    }

    setIsExecutingSwap(true);
    try {
      const txHash = await executeSwap(sell, amount, buy);
      const action = sell === 'ETH' && buy === 'WETH' ? 'wrapped' : 'swapped';
      const msg = `Swap executed: ${action} ${amount} ${sell} for ${buy}.\n${txHash}`;
      const chain = typeof window !== 'undefined' ? localStorage.getItem('selectedChain') ?? undefined : undefined;
      return { message: msg, txHash, chain, sellToken: sell, buyToken: buy, amount };
    } catch (err) {
      console.error('[Swap execution failed]', err);
      const rawMsg = err instanceof Error ? err.message : 'Swap failed';
      const isInsufficientFunds =
        rawMsg.toLowerCase().includes('insufficient funds') ||
        (err as { code?: string })?.code === 'INSUFFICIENT_FUNDS';
      const isReplacementUnderpriced =
        rawMsg.toLowerCase().includes('replacement') ||
        rawMsg.toLowerCase().includes('underpriced') ||
        (err as { code?: string })?.code === 'REPLACEMENT_UNDERPRICED';
      let msg = rawMsg;
      if (isInsufficientFunds) {
        msg =
          'Your wallet doesn’t have enough ETH on this network (for the swap and gas). Get testnet ETH from a faucet (Base Sepolia) or add more ETH on mainnet.';
      } else if (isReplacementUnderpriced) {
        msg =
          'A previous transaction may still be pending. Wait a minute and try again, or use Base Sepolia testnet (network selector → Base Testnet) to test with faucet ETH.';
      }
      return { message: `Swap could not be executed: ${msg}` };
    } finally {
      setIsExecutingSwap(false);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading || isExecutingSwap) return;

    const userMessage = input;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      // Prefer Privy SDK access token (refreshes if needed); fallback to localStorage for legacy/cookie-only flows
      let accessToken: string | null = null;
      if (typeof getAccessToken === 'function') {
        try {
          accessToken = (await getAccessToken()) ?? null;
        } catch {
          accessToken = null;
        }
      }
      if (!accessToken && typeof window !== 'undefined') {
        accessToken = localStorage.getItem('privy:token');
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message: userMessage,
          history: messages.map(m => ({ role: m.role, content: m.content })),
          accessToken,
        }),
      });

      const data = await response.json();

      const executionResult = await maybeExecuteSwapIntent(data.content);
      if (executionResult) {
        console.log('[Swap Intent]', data.content);
        if (executionResult.txHash && executionResult.chain && executionResult.sellToken && executionResult.buyToken && executionResult.amount) {
          try {
            await fetch('/api/record-swap', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                accessToken,
                chain: executionResult.chain,
                sellToken: executionResult.sellToken,
                buyToken: executionResult.buyToken,
                sellAmount: executionResult.amount,
                txHash: executionResult.txHash,
              }),
            });
          } catch (recordErr) {
            console.warn('Failed to record swap to 0G:', recordErr);
          }
        }
      }

      setMessages((prev) => {
        if (executionResult) {
          return [...prev, { role: 'assistant', content: executionResult.message }];
        }

        return [
          ...prev,
          {
            role: 'assistant',
            content: data.content,
            zgHash: data.zgHash,
            zgError: data.zgError,
          },
        ];
      });
    } catch (error) {
      console.error("Chat error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="w-full rounded-2xl flex flex-col shadow-2xl backdrop-blur-sm"
      style={{
        backgroundColor: CHAT_PANEL.container_color,
        borderColor: CHAT_PANEL.border_color,
        borderWidth: `${CHAT_PANEL.border_width}px`,
        borderStyle: 'solid',
        boxSizing: 'content-box',
        width: `${CHAT_PANEL.width}px`,
        height: `${CHAT_PANEL.height}px`,
      }}
    >
      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide">
        {messages.length === 0 && (
          <p className="text-gray-500 text-center mt-20">Ask me to swap ETH for USDC or check your balance...</p>
        )}
        {messages.map((m, i) => (
          m.role === 'assistant' ? (
            <div key={i} className="flex items-start gap-3">
                <div
                  className="shrink-0 h-10 w-10 rounded-full bg-white/5 border flex items-center justify-center overflow-hidden"
                  style={{ borderColor: CHAT_PANEL.agent_icon_border_color }}
                >
                <SpinningLogo src={Logo} alt="Altair" className="h-9 w-9 object-contain" />
              </div>
              <div className="flex flex-col items-start">
                <div
                  className="max-w-[85%] px-4 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words"
                  style={{
                    backgroundColor: CHAT_PANEL.agent_chat_container_color,
                    color: CHAT_PANEL.agent_chat_text_color,
                  }}
                >
                  {m.content}
                </div>
                {m.zgHash && !m.zgError && (
                  <div className="flex items-center gap-2 mt-1">
                    <a 
                      href={`https://scan-testnet.0g.ai/tx/${m.zgHash}`} 
                      target="_blank"
                      className="flex items-center gap-1 text-[10px] text-green-500 hover:underline"
                    >
                      <ShieldCheck className="w-3 h-3" />
                      Verified by 0g
                    </a>
                  </div>
                )}
                {m.zgError && (
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-yellow-400">
                    0G upload failed
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div key={i} className="flex flex-col items-end">
              <div
                className="max-w-[85%] px-4 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words"
                style={{
                  backgroundColor: CHAT_PANEL.user_chat_container_color,
                  color: CHAT_PANEL.user_chat_text_color,
                }}
              >
                {m.content}
              </div>
            </div>
          )
        ))}
        {isLoading && (
          <div className="flex items-start gap-3">
            <div className="shrink-0 h-10 w-10 rounded-full bg-white/5 border border-gray-700 flex items-center justify-center overflow-hidden">
              <SpinningLogo src={Logo} alt="Altair" className="h-9 w-9 object-contain" />
            </div>
            <div className="bg-gray-800 p-3 rounded-2xl animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div
        className="p-4 border-t flex gap-2"
        style={{
          borderColor: CHAT_PANEL.border_color,
          borderTopWidth: `${CHAT_PANEL.border_width}px`,
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="I want to swap 0.1 ETH for USDC..."
          className="flex-1 bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2 text-sm outline-none focus:border-[var(--chat-highlight-color)] transition-colors"
          style={{ ['--chat-highlight-color' as never]: CHAT_PANEL.chat_highlight_color }}
        />
        <button 
          onClick={handleSendMessage}
          disabled={isLoading || isExecutingSwap}
          className="disabled:opacity-50 p-2 rounded-xl transition-all cursor-pointer"
          style={{ backgroundColor: CHAT_PANEL.chat_button_container_color }}
        >
          <Send className="w-5 h-5" color={CHAT_PANEL.chat_button_icon_color} />
        </button>
      </div>
    </div>
  );
}
