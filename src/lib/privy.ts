import { PrivyClient, type LinkedAccountWithMetadata } from '@privy-io/server-auth';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? process.env.PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;

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
  const claims = await privy.verifyAuthToken(accessToken);
  const user = await privy.getUserById(claims.userId);

  const smartWalletAddress =
    user.smartWallet?.address ||
    (user.linkedAccounts
      .find((a: LinkedAccountWithMetadata) => a.type === 'smart_wallet') as
      | (LinkedAccountWithMetadata & { address?: string })
      | undefined)?.address;

  if (!smartWalletAddress) {
    throw new Error('No Privy smart wallet found for user');
  }

  return smartWalletAddress;
}

export type PrivyWalletContext = {
  smartWalletAddress: string;
};

export async function resolvePrivyWalletContext(accessToken: string): Promise<PrivyWalletContext> {
  const smartWalletAddress = await getPrivySmartWalletAddress(accessToken);
  return { smartWalletAddress };
}
