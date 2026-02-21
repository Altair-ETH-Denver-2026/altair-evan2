'use client';

import React, { useState, useRef, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useSwap } from '../lib/useSwap';
import { UserRound, LogOut, Settings, Wallet, Wrench, Copy, Globe2, Check } from 'lucide-react';
import { useEffect as useClientEffect, useState as useClientState } from 'react';
import { BALANCE_DECIMALS, BLOCKCHAIN, CHAINS, type ChainKey } from '../../config';

export default function UserMenu() {
  const { logout, authenticated } = usePrivy();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [isDevOpen, setIsDevOpen] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapMessage, setSwapMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [ethBalance, setEthBalance] = useClientState<string>('0');
  const [usdcBalance, setUsdcBalance] = useClientState<string>('0');
  const [evmAddress, setEvmAddress] = useClientState<string>('');
  const [isNetworkOpen, setIsNetworkOpen] = useState(false);
  const [selectedChain, setSelectedChain] = useState<ChainKey>(BLOCKCHAIN);
  const executeSwap = useSwap(selectedChain);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedChain = localStorage.getItem('selectedChain');
      if (storedChain && storedChain in CHAINS) {
        setSelectedChain(storedChain as ChainKey);
      }
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
        setIsWalletOpen(false);
        setIsDevOpen(false);
        setIsNetworkOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useClientEffect(() => {
    const controller = new AbortController();

    const run = async () => {
      if (!authenticated) {
        setEthBalance('0');
        setUsdcBalance('0');
        setEvmAddress('');
        return;
      }

      const token = typeof window !== 'undefined' ? localStorage.getItem('privy:token') : null;
      if (!token) return;

      try {
        const res = await fetch('/api/balances', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ accessToken: token, chain: selectedChain }),
          signal: controller.signal,
        });

        const data = await res.json();
        if (data?.eth) setEthBalance(data.eth);
        if (data?.usdc) setUsdcBalance(data.usdc);
        if (data?.address) setEvmAddress(data.address);
      } catch {
        setEthBalance('0');
        setUsdcBalance('0');
        setEvmAddress('');
      }
    };

    run();

    return () => controller.abort();
  }, [authenticated, selectedChain, setEthBalance, setUsdcBalance, setEvmAddress]);

  if (!authenticated) return null;

  const showSwapMessage = (message: { type: 'success' | 'error'; text: string }) => {
    setSwapMessage(message);
    window.setTimeout(() => {
      setSwapMessage((current) => (current === message ? null : current));
    }, 6000);
  };

  return (
    <div className="relative flex items-center gap-3" ref={menuRef}>
      {swapMessage && (
        <div
          className={`absolute right-0 top-12 z-[110] w-64 rounded-xl border px-4 py-3 text-xs shadow-2xl whitespace-pre-wrap break-words ${
            swapMessage.type === 'success'
              ? 'bg-emerald-900/90 border-emerald-700 text-emerald-100'
              : 'bg-red-900/90 border-red-700 text-red-100'
          }`}
        >
          {swapMessage.text}
        </div>
      )}
      {/* Dev tools dropdown */}
      <div className="relative">
        <button
          onClick={() => {
        setIsDevOpen(!isDevOpen);
        setIsWalletOpen(false);
        setIsProfileOpen(false);
        setIsNetworkOpen(false);
      }}
          title="Dev Tools"
          className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-800 border border-gray-700 hover:border-blue-500 transition-all shadow-md cursor-pointer"
        >
          <Wrench className="w-6 h-6 text-gray-300" />
        </button>
        {isDevOpen && (
          <div className="absolute right-0 mt-3 w-48 rounded-xl bg-gray-900 border border-gray-700 shadow-2xl z-[100] overflow-hidden flex flex-col">
            <button
              onClick={async () => {
                setIsSwapping(true);
                try {
                  const txHash = await executeSwap('ETH', '0.000001', 'USDC');
                  console.log('[Test Swap] Swap complete:', txHash);
                  showSwapMessage({
                    type: 'success',
                    text: `Swap complete.\n${txHash}`,
                  });
                } catch (error) {
                  console.error('[Test Swap] Swap failed:', error);
                  const message = error instanceof Error ? error.message : 'Swap failed';
                  showSwapMessage({
                    type: 'error',
                    text: message,
                  });
                } finally {
                  setIsSwapping(false);
                  setIsDevOpen(false);
                }
              }}
              disabled={isSwapping}
              className="flex w-full items-center px-4 py-3 text-sm text-gray-300 hover:bg-gray-800 transition-colors text-left"
            >
              <span className="flex-1">Test Swap: 0.000001 ETH for USDC</span>
            </button>
            <div className="h-[1px] bg-gray-700 w-full" />
            <button
              onClick={async () => {
                setIsSwapping(true);
                try {
                  const txHash = await executeSwap('ETH', '0.000001', 'WETH');
                  console.log('[Test Swap] Swap complete:', txHash);
                  showSwapMessage({
                    type: 'success',
                    text: `Swap complete.\n${txHash}`,
                  });
                } catch (error) {
                  console.error('[Test Swap] Swap failed:', error);
                  const message = error instanceof Error ? error.message : 'Swap failed';
                  showSwapMessage({
                    type: 'error',
                    text: message,
                  });
                } finally {
                  setIsSwapping(false);
                  setIsDevOpen(false);
                }
              }}
              disabled={isSwapping}
              className="flex w-full items-center px-4 py-3 text-sm text-gray-300 hover:bg-gray-800 transition-colors text-left"
            >
              <span className="flex-1">Test Swap: 0.000001 ETH for WETH</span>
            </button>
            <div className="h-[1px] bg-gray-700 w-full" />
            <button
              onClick={() => setIsDevOpen(false)}
              className="flex w-full items-center px-4 py-3 text-sm text-gray-300 hover:bg-gray-800 transition-colors text-left"
            >
              <span className="flex-1">Test Withdraw</span>
            </button>
          </div>
        )}
      </div>

      {/* Network dropdown */}
      <div className="relative">
        <button
          onClick={() => {
            setIsNetworkOpen(!isNetworkOpen);
            setIsWalletOpen(false);
            setIsProfileOpen(false);
            setIsDevOpen(false);
          }}
          title="Switch Chain"
          className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-800 border border-gray-700 hover:border-blue-500 transition-all shadow-md cursor-pointer"
        >
          <Globe2 className="w-6 h-6 text-gray-300" />
        </button>
        {isNetworkOpen && (
          <div className="absolute right-0 mt-3 w-48 rounded-xl bg-gray-900 border border-gray-700 shadow-2xl z-[100] overflow-hidden flex flex-col">
            {[{ label: 'ETH Mainnet', key: 'ETH_MAINNET' as ChainKey }, { label: 'Sepolia Testnet', key: 'ETH_SEPOLIA' as ChainKey }, { label: 'Base Mainnet', key: 'BASE_MAINNET' as ChainKey }, { label: 'Base Testnet', key: 'BASE_SEPOLIA' as ChainKey }, { label: 'Solana Mainnet', key: null as ChainKey | null }].map(({ label, key }) => {
              const isSelected = key ? selectedChain === key : false;
              const handleClick = () => {
                if (!key) {
                  setIsNetworkOpen(false);
                  return;
                }
                setSelectedChain(key);
                if (typeof window !== 'undefined') {
                  localStorage.setItem('selectedChain', key);
                }
                setIsNetworkOpen(false);
              };
              return (
                <button
                  key={label}
                  onClick={handleClick}
                  className="flex w-full items-center px-4 py-3 text-sm text-gray-300 hover:bg-gray-800 transition-colors text-left cursor-pointer"
                >
                  <span className="mr-3 w-4 flex justify-center">{isSelected ? <Check className="w-4 h-4 text-white" /> : null}</span>
                  <span className="flex-1">{label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Wallet dropdown */}
      <div className="relative">
        <button
          onClick={() => {
            setIsWalletOpen(!isWalletOpen);
            setIsProfileOpen(false);
            setIsDevOpen(false);
            setIsNetworkOpen(false);
          }}
          title="Wallet"
          className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-800 border border-gray-700 hover:border-blue-500 transition-all shadow-md cursor-pointer"
        >
          <Wallet className="w-6 h-6 text-gray-300" />
        </button>
            {isWalletOpen && (
          <div className="absolute right-0 mt-3 w-48 rounded-xl bg-gray-900 border border-gray-700 shadow-2xl z-[100] overflow-hidden flex flex-col">
            <div className="flex w-full items-center px-4 py-3 text-sm text-gray-300 break-all">
              <button
                type="button"
                onClick={() => {
                  if (evmAddress) navigator.clipboard?.writeText(evmAddress).catch(() => {});
                }}
                className="text-left cursor-pointer"
                title={evmAddress || 'Unknown'}
              >
                <Copy className="w-4 h-4" />
              </button>
              <span className="text-gray-100 px-3 text-right flex-1 text-sm" title={evmAddress || 'Unknown'}>
                {evmAddress ? `${evmAddress.slice(0, 6)}...${evmAddress.slice(-4)}` : '—'}
              </span>
            </div>
            <div className="h-[1px] bg-gray-700 w-full" />
            <div className="flex w-full items-center px-4 py-3 text-sm text-gray-300">
              <span className="flex-1">ETH</span>
              <span
                className="text-gray-100 px-3 text-center whitespace-nowrap hover:whitespace-normal"
                title={ethBalance}
              >
                {Number.isNaN(Number(ethBalance))
                  ? ethBalance
                  : Number(ethBalance).toFixed(BALANCE_DECIMALS)}
              </span>
            </div>
            <div className="h-[1px] bg-gray-700 w-full" />
            <div className="flex w-full items-center px-4 py-3 text-sm text-gray-300">
              <span className="flex-1">USDC</span>
              <span
                className="text-gray-100 px-3 text-center whitespace-nowrap hover:whitespace-normal"
                title={usdcBalance}
              >
                {Number.isNaN(Number(usdcBalance))
                  ? usdcBalance
                  : Number(usdcBalance).toFixed(BALANCE_DECIMALS)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Profile dropdown */}
      <div className="relative">
        <button
          onClick={() => {
            setIsProfileOpen(!isProfileOpen);
            setIsWalletOpen(false);
          }}
          title="Profile"
          className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-800 border border-gray-700 hover:border-blue-500 transition-all shadow-md cursor-pointer"
        >
          <UserRound className="w-6 h-6 text-gray-300" />
        </button>

        {isProfileOpen && (
          // right-0 ensures the menu grows to the left, staying on screen
          <div className="absolute right-0 mt-3 w-48 rounded-xl bg-gray-900 border border-gray-700 shadow-2xl z-[100] overflow-hidden flex flex-col">
            <button
              onClick={() => { alert('Coming soon!'); setIsProfileOpen(false); }}
              className="flex w-full items-center px-4 py-3 text-sm text-gray-300 hover:bg-gray-800 transition-colors text-left"
            >
              <Settings className="w-4 h-4 mr-3" />
              <span className="flex-1">Edit Profile</span>
            </button>
            
            <div className="h-[1px] bg-gray-700 w-full" />
            
            <button
              onClick={() => { logout(); setIsProfileOpen(false); }}
              className="flex w-full items-center px-4 py-3 text-sm text-red-400 hover:bg-gray-800 transition-colors text-left"
            >
              <LogOut className="w-4 h-4 mr-3" />
              <span className="flex-1">Log Out</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

