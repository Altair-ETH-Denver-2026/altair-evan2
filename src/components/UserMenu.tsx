'use client';

import React, { useState, useRef, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { UserRound, LogOut, Settings } from 'lucide-react';

export default function UserMenu() {
  const { logout, authenticated } = usePrivy();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!authenticated) return null;

  return (
    <div className="relative inline-block" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-800 border border-gray-700 hover:border-blue-500 transition-all shadow-md"
      >
        <UserRound className="w-6 h-6 text-gray-300" />
      </button>

      {isOpen && (
        // right-0 ensures the menu grows to the left, staying on screen
        <div className="absolute right-0 mt-3 w-48 rounded-xl bg-gray-900 border border-gray-700 shadow-2xl z-[100] overflow-hidden flex flex-col">
          <button
            onClick={() => { alert('Coming soon!'); setIsOpen(false); }}
            className="flex w-full items-center px-4 py-3 text-sm text-gray-300 hover:bg-gray-800 transition-colors text-left"
          >
            <Settings className="w-4 h-4 mr-3" />
            <span className="flex-1">Edit Profile</span>
          </button>
          
          <div className="h-[1px] bg-gray-700 w-full" />
          
          <button
            onClick={() => { logout(); setIsOpen(false); }}
            className="flex w-full items-center px-4 py-3 text-sm text-red-400 hover:bg-gray-800 transition-colors text-left"
          >
            <LogOut className="w-4 h-4 mr-3" />
            <span className="flex-1">Log Out</span>
          </button>
        </div>
      )}
    </div>
  );
}