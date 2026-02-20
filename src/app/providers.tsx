'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { base } from 'viem/chains';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={'cmlspyaq0000p0dii61ggr5qr'}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#676FFF', // Altair purple/blue
          showWalletLoginFirst: false,
        },
        // This is key: it creates a wallet for email/google users automatically
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
        defaultChain: base,
        supportedChains: [base],
      }}
    >
      {children}
    </PrivyProvider>
  );
}