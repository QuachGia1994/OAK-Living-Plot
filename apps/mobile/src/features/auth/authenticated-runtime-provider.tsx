import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BillingSessionProvider } from '@/features/billing/billing-session-context';
import type { BillingSession } from '@/features/billing/contracts';
import { StoryExperienceClientProvider } from '@/features/story/story-client-context';
import { loadBackendUserId } from './backend-identity';
import { useMobileAuth } from './mobile-auth-context';

export function AuthenticatedRuntimeProvider({ children }: { children: ReactNode }) {
  const auth = useMobileAuth();
  const apiBaseUrl = process.env.EXPO_PUBLIC_LIVING_PLOT_API_URL?.trim() ?? '';
  const [resolvedIdentity, setResolvedIdentity] = useState<{ clerkUserId: string; appUserId: string } | null>(null);

  useEffect(() => {
    let active = true;
    const clerkUserId = auth.clerkUserId;
    if (!apiBaseUrl || !auth.configured || !auth.isLoaded || !auth.isSignedIn || !clerkUserId) {
      return () => { active = false; };
    }

    void loadBackendUserId(apiBaseUrl, auth.getToken)
      .then((appUserId) => { if (active) setResolvedIdentity({ clerkUserId, appUserId }); })
      .catch(() => { /* Billing stays unavailable until a later successful identity resolution. */ });
    return () => { active = false; };
  }, [apiBaseUrl, auth.clerkUserId, auth.configured, auth.getToken, auth.isLoaded, auth.isSignedIn]);

  const billingSession = useMemo<BillingSession | null>(() => {
    if (!auth.isSignedIn || !auth.clerkUserId || resolvedIdentity?.clerkUserId !== auth.clerkUserId) return null;
    return { appUserId: resolvedIdentity.appUserId, getBearerToken: auth.getToken };
  }, [auth.clerkUserId, auth.getToken, auth.isSignedIn, resolvedIdentity]);

  return (
    <BillingSessionProvider session={billingSession}>
      <StoryExperienceClientProvider>{children}</StoryExperienceClientProvider>
    </BillingSessionProvider>
  );
}
