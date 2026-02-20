import { PrivyClient, type LinkedAccountWithMetadata } from '@privy-io/server-auth';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? process.env.PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;
const PRIVY_VERIFICATION_KEY = process.env.PRIVY_VERIFICATION_KEY;

if (!PRIVY_APP_ID) {
  throw new Error('Missing NEXT_PUBLIC_PRIVY_APP_ID (or PRIVY_APP_ID) environment variable');
}

if (!PRIVY_APP_SECRET) {
  // We throw here so the error is clear in server logs during development/deploy
  throw new Error('Missing PRIVY_APP_SECRET environment variable for server-side wallet access');
}

const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET, {
  walletApi: {
    authorizationPrivateKey: process.env.PRIVY_WALLET_AUTH_PRIVATE_KEY,
  },
});

export async function getPrivySmartWalletAddress(accessToken: string): Promise<string> {
  if (!accessToken) {
    throw new Error('Missing Privy access token');
  }

  // Validate the token and extract the user id
  console.log('[Privy] Verifying auth token; length:', accessToken?.length ?? 0);
  const claims = await privy.verifyAuthToken(accessToken, PRIVY_VERIFICATION_KEY);
  console.log('[Privy] Token verified. userId:', claims.userId, 'issuer:', claims.issuer, 'aud:', claims.appId);
  const user = await privy.getUserById(claims.userId);
  console.log('[Privy] Fetched user. linkedAccounts:', user.linkedAccounts?.length ?? 0, 'smartWallet:', user.smartWallet?.address);

  const smartWalletAddress =
    user.smartWallet?.address ||
    (user.linkedAccounts
      .find((a: LinkedAccountWithMetadata) => a.type === 'smart_wallet') as
      | (LinkedAccountWithMetadata & { address?: string })
      | undefined)?.address;

  if (smartWalletAddress) {
    console.log('smartWalletAddress', smartWalletAddress);
    return smartWalletAddress;
  }

  // Try wallet API to fetch smart wallet if not present on user
  try {
    const wallets = await privy.walletApi.getWallets({ chainType: 'ethereum' });
    const existing = wallets.data?.find((w) => w.address)?.address;
    if (existing) {
      console.log('[Privy] walletApi.getWallets returned:', existing);
      return existing;
    }
  } catch (e) {
    console.warn('[Privy] walletApi.getWallets failed:', e);
  }

  throw new Error('No Privy smart wallet found for user');
}

export type PrivyWalletContext = {
  smartWalletAddress: string;
};

export async function resolvePrivyWalletContext(accessToken: string): Promise<PrivyWalletContext> {
  const smartWalletAddress = await getPrivySmartWalletAddress(accessToken);
  return { smartWalletAddress };
}
