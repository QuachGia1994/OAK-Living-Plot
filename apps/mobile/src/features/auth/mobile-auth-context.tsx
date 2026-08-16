import { ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

export interface MobileAuthSession {
  configured: boolean;
  isLoaded: boolean;
  isSignedIn: boolean;
  clerkUserId: string | null;
  getToken(): Promise<string | null>;
  signOut(): Promise<void>;
}

const unconfiguredSession: MobileAuthSession = {
  configured: false,
  isLoaded: true,
  isSignedIn: false,
  clerkUserId: null,
  async getToken() { return null; },
  async signOut() {},
};

const MobileAuthContext = createContext<MobileAuthSession>(unconfiguredSession);

export function MobileAuthProvider({ children }: { children: ReactNode }) {
  const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  if (!publishableKey) {
    return <MobileAuthContext.Provider value={unconfiguredSession}>{children}</MobileAuthContext.Provider>;
  }

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ClerkAuthBridge>{children}</ClerkAuthBridge>
    </ClerkProvider>
  );
}

function ClerkAuthBridge({ children }: { children: ReactNode }) {
  const auth = useAuth({ treatPendingAsSignedOut: false });
  const { getToken, isLoaded, isSignedIn, signOut, userId } = auth;
  const value = useMemo<MobileAuthSession>(() => ({
    configured: true,
    isLoaded,
    isSignedIn: isSignedIn === true,
    clerkUserId: userId ?? null,
    async getToken() {
      if (!isSignedIn) return null;
      return getToken();
    },
    async signOut() {
      if (isSignedIn) await signOut();
    },
  }), [getToken, isLoaded, isSignedIn, signOut, userId]);

  return <MobileAuthContext.Provider value={value}>{children}</MobileAuthContext.Provider>;
}

export function useMobileAuth(): MobileAuthSession {
  return useContext(MobileAuthContext);
}
