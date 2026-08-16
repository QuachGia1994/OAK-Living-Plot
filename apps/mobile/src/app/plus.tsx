import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMobileAuth } from '@/features/auth/mobile-auth-context';
import type { BackendEntitlement } from '@/features/billing/contracts';
import { BillingClientError } from '@/features/billing/contracts';
import { useBillingSession } from '@/features/billing/billing-session-context';
import { createBillingCoordinator } from '@/features/billing/runtime';
import { ActionButton, BrandMark, Card, ErrorState, Eyebrow, Pill, Screen } from '@/ui/primitives';
import { colors, spacing } from '@/ui/theme';

export default function PlusScreen() {
  const router = useRouter();
  const auth = useMobileAuth();
  const session = useBillingSession();
  const coordinator = useMemo(() => createBillingCoordinator(), []);
  const [busyAction, setBusyAction] = useState<'paywall' | 'restore' | 'refresh' | null>(null);
  const [entitlement, setEntitlement] = useState<BackendEntitlement | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function presentPaywall() {
    if (!session) return setMessage('A signed-in development build is required before the store paywall can use your canonical account ID.');
    setBusyAction('paywall');
    setMessage(null);
    try {
      const result = await coordinator.presentPaywall(session);
      setEntitlement(result.entitlement);
      setMessage(result.entitlement.plusActive
        ? 'Plus is active on the backend.'
        : 'Store action finished. Backend Plus is not active yet; retry refresh after RevenueCat webhook sync.');
    } catch (error) {
      setMessage(billingMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function refreshAccess() {
    if (!session) return setMessage('Sign in first so the backend entitlement can be read for the canonical user.');
    setBusyAction('refresh');
    setMessage(null);
    try {
      const result = await coordinator.refresh(session);
      setEntitlement(result.entitlement);
      setMessage(result.entitlement.plusActive ? 'Backend Plus is active.' : 'Backend entitlement is still Free.');
    } catch (error) {
      setMessage(billingMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function restore() {
    if (!session) return setMessage('Sign in first. Restore must be linked to the same canonical Living Plot user.');
    setBusyAction('restore');
    setMessage(null);
    try {
      const result = await coordinator.restore(session);
      setEntitlement(result.entitlement);
      setMessage(result.entitlement.plusActive ? 'Purchases restored and Plus is active.' : 'Restore completed; backend entitlement remains Free.');
    } catch (error) {
      setMessage(billingMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <Screen>
      <BrandMark />
      <View style={styles.hero}>
        <Eyebrow>OAK Living Plot Plus</Eyebrow>
        <Text style={styles.title}>More story. More voice. Same canonical memory.</Text>
        <Text style={styles.body}>Plus raises the server-enforced daily allowance without creating an unlimited-AI promise.</Text>
      </View>

      <Card>
        <Pill tone="accent">PLUS</Pill>
        <Text style={styles.planTitle}>20 text episodes + 10 fresh voiced episodes / UTC day</Text>
        <Text style={styles.body}>Free remains 3 text + 1 fresh voice. Cached audio replay does not spend a new voice generation slot.</Text>
        {entitlement ? <Pill tone={entitlement.plusActive ? 'success' : 'neutral'}>Backend: {entitlement.tier.toUpperCase()}</Pill> : null}
      </Card>

      {!session ? (
        <ErrorState
          title="Canonical store identity unavailable"
          message={auth.configured && auth.isSignedIn
            ? "Your internal Living Plot user ID is still being resolved from the backend. Retry shortly."
            : "Sign in first. RevenueCat is configured only with the internal Living Plot user ID resolved from /v1/me."}
        />
      ) : null}

      <View style={styles.actions}>
        {auth.configured && !auth.isSignedIn ? <ActionButton label="Sign in with email code" variant="secondary" onPress={() => router.push('/auth')} /> : null}
        <ActionButton label="Open Plus paywall" busy={busyAction === 'paywall'} onPress={presentPaywall} />
        <ActionButton label="Refresh access" variant="secondary" busy={busyAction === 'refresh'} onPress={refreshAccess} />
        <ActionButton label="Restore purchases" variant="secondary" busy={busyAction === 'restore'} onPress={restore} />
        <ActionButton label="Back" variant="ghost" onPress={() => router.back()} />
      </View>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </Screen>
  );
}

function billingMessage(error: unknown): string {
  if (error instanceof BillingClientError) return error.message;
  return 'Billing could not be completed.';
}

const styles = StyleSheet.create({
  hero: { gap: spacing.sm },
  title: { color: colors.ink, fontSize: 32, fontWeight: '800', lineHeight: 38 },
  planTitle: { color: colors.ink, fontSize: 20, fontWeight: '800', lineHeight: 27 },
  body: { color: colors.inkMuted, fontSize: 15, lineHeight: 23 },
  actions: { gap: spacing.sm },
  message: { color: colors.inkMuted, fontSize: 14, lineHeight: 21 },
});
