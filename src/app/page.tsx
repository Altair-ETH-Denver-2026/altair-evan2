'use client';

import React from 'react';
import { usePrivy } from '@privy-io/react-auth';
import UserMenu from '../components/UserMenu';

export default function Home() {
  const { login, authenticated } = usePrivy();

  return (
    <main className="relative min-h-screen w-full bg-black text-white flex flex-col items-center justify-center p-8">
      {/* HEADER CONTAINER: full width, aligns items to the right */}
      <div className="absolute top-8 left-0 right-0 flex justify-end pr-8 z-50">
        <UserMenu />
      </div>

      {/* CENTER CONTENT */}
      <div className="text-center">
        <h1 className="text-5xl font-extrabold mb-4 bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
          Altair
        </h1>
        <p className="text-gray-400 mb-8 font-medium">Your concierge for DeFi on Base.</p>
        
        {!authenticated && (
          <button 
            onClick={login}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-full transition-all shadow-lg shadow-blue-500/20"
          >
            Connect to Altair
          </button>
        )}
      </div>
    </main>
  );
}
