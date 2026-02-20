'use client';

import React, { useState, useRef, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { UserRound, LogOut, Settings, Wallet } from 'lucide-react';
import { useEffect as useClientEffect, useState as useClientState } from 'react';

export default function UserMenu() {
  const { logout, authenticated } = usePrivy();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [ethBalance, setEthBalance] = useClientState<string>('0');
  const [usdcBalance, setUsdcBalance] = useClientState<string>('0');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
        setIsWalletOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useClientEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('privy:token') : null;
    if (!token) return;

    const controller = new AbortController();

    fetch('/api/balances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ accessToken: token }),
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.eth) setEthBalance(data.eth);
        if (data?.usdc) setUsdcBalance(data.usdc);
      })
      .catch(() => {
        setEthBalance('0');
        setUsdcBalance('0');
      });

    return () => controller.abort();
  }, []);

  if (!authenticated) return null;

  return (
    <div className="relative flex items-center gap-3" ref={menuRef}>
      {/* Wallet dropdown */}
      <div className="relative">
        <button
          onClick={() => {
            setIsWalletOpen(!isWalletOpen);
            setIsProfileOpen(false);
          }}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-800 border border-gray-700 hover:border-blue-500 transition-all shadow-md"
        >
          <Wallet className="w-6 h-6 text-gray-300" />
        </button>
        {isWalletOpen && (
          <div className="absolute right-0 mt-3 w-48 rounded-xl bg-gray-900 border border-gray-700 shadow-2xl z-[100] overflow-hidden flex flex-col">
            <div className="flex w-full items-center px-4 py-3 text-sm text-gray-300">
              <span className="flex-1">ETH</span>
              <span
                className="text-gray-100 px-3 text-center whitespace-nowrap hover:whitespace-normal"
                title={ethBalance}
              >
                {Number.isNaN(Number(ethBalance))
                  ? ethBalance
                  : Number(ethBalance).toFixed(8)}
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
                  : Number(usdcBalance).toFixed(8)}
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
          className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-800 border border-gray-700 hover:border-blue-500 transition-all shadow-md"
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
