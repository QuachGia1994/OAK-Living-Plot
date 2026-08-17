import { useMemo, useState, type ReactNode } from 'react';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { ACCOUNT_DELETE_CONFIRMATION } from '@/features/account/contracts';
import { deleteAccountThenSignOut } from '@/features/account/delete-flow';
import { HttpAccountDataClient, UnavailableAccountDataClient } from '@/features/account/http-account-client';
import { useMobileAuth } from '@/features/auth/mobile-auth-context';
import { revenueCatStoreModeFromEnv } from '@/features/billing/revenuecat-config';
import type { NarratorVariant, StoryLocale, UiLocale } from '@/features/preferences/contracts';
import { useUserPreferences } from '@/features/preferences/preferences-context';
import { ActionButton, BrandMark, Card, ErrorState, Eyebrow, Pill, Screen } from '@/ui/primitives';
import { colors, radius, spacing } from '@/ui/theme';

const unavailableAccount = new UnavailableAccountDataClient();

export default function SettingsScreen() {
  const router = useRouter();
  const auth = useMobileAuth();
  const { preferences, loading, error: preferenceError, save } = useUserPreferences();
  const apiBaseUrl = process.env.EXPO_PUBLIC_LIVING_PLOT_API_URL?.trim() ?? '';
  const account = useMemo(() => {
    if (!apiBaseUrl || !auth.configured || !auth.isLoaded || !auth.isSignedIn) return unavailableAccount;
    return new HttpAccountDataClient(apiBaseUrl, auth.getToken);
  }, [apiBaseUrl, auth.configured, auth.getToken, auth.isLoaded, auth.isSignedIn]);
  const [preferenceDraft, setPreferenceDraft] = useState<Partial<{
    uiLocale: UiLocale;
    storyLocale: StoryLocale;
    narratorVariant: NarratorVariant;
  }>>({});
  const uiLocale = preferenceDraft.uiLocale ?? preferences.uiLocale;
  const storyLocale = preferenceDraft.storyLocale ?? preferences.storyLocale;
  const narratorVariant = preferenceDraft.narratorVariant ?? preferences.narratorVariant;
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<'preferences' | 'export' | 'delete' | 'signout' | 'health' | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [postDeleteSignOutFailed, setPostDeleteSignOutFailed] = useState(false);
  const [apiHealth, setApiHealth] = useState<'unchecked' | 'ok' | 'unreachable'>(apiBaseUrl ? 'unchecked' : 'unreachable');

  async function savePreferences() {
    setBusy('preferences');
    setMessage(null);
    try {
      await save({ uiLocale, storyLocale, narratorVariant });
      setPreferenceDraft({});
      setMessage('Preferences saved. Existing plots keep their original story locale.');
    } catch {
      setMessage('Preferences could not be saved.');
    } finally {
      setBusy(null);
    }
  }

  async function exportData() {
    setBusy('export');
    setMessage(null);
    try {
      const snapshot = await account.loadExport();
      await Share.share({ title: 'Living Plot data export', message: JSON.stringify(snapshot, null, 2) });
      setMessage('Your export was prepared locally for the share sheet.');
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Account export could not be prepared.');
    } finally {
      setBusy(null);
    }
  }

  async function deleteData() {
    setBusy('delete');
    setMessage(null);
    try {
      const result = await deleteAccountThenSignOut(account, confirmation, auth.signOut);
      if (result === 'deleted_and_signed_out') {
        router.replace('/');
      } else {
        setPostDeleteSignOutFailed(true);
        setMessage('Your Living Plot data was deleted, but this device could not sign out of Clerk. Retry sign-out before continuing to use the app.');
      }
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Account data could not be deleted.');
    } finally {
      setBusy(null);
    }
  }

  async function retrySignOut() {
    setBusy('signout');
    try {
      await auth.signOut();
      setPostDeleteSignOutFailed(false);
      router.replace('/');
    } catch {
      setMessage('Your Living Plot data is already deleted, but Clerk sign-out is still unavailable on this device.');
    } finally {
      setBusy(null);
    }
  }

  async function checkHealth() {
    if (!apiBaseUrl) return;
    setBusy('health');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await fetch(`${apiBaseUrl.replace(/\/$/u, '')}/health`, { signal: controller.signal });
      setApiHealth(response.ok ? 'ok' : 'unreachable');
    } catch {
      setApiHealth('unreachable');
    } finally {
      clearTimeout(timeout);
      setBusy(null);
    }
  }

  const runtimeMode = apiBaseUrl && auth.configured ? 'live' : 'preview';
  const revenueCatMode = revenueCatStoreModeFromEnvForRuntime();
  const diagnostics = [
    `Living Plot ${Constants.expoConfig?.version ?? 'unknown'}`,
    `runtime=${runtimeMode}`,
    `apiConfigured=${Boolean(apiBaseUrl)}`,
    `clerkConfigured=${auth.configured}`,
    `signedIn=${auth.isSignedIn}`,
    `revenuecatMode=${revenueCatMode}`,
    `apiHealth=${apiHealth}`,
  ].join('\n');

  return (
    <Screen>
      <View style={styles.topBar}>
        <BrandMark />
        <ActionButton label="Back" variant="ghost" onPress={() => router.back()} />
      </View>

      <View style={styles.hero}>
        <Eyebrow>Settings & data</Eyebrow>
        <Text style={styles.title}>Control the defaults. Keep the story canonical.</Text>
        <Text style={styles.body}>These preferences affect new requests and narration defaults. They do not rewrite past episodes or committed choices.</Text>
      </View>

      {preferenceError ? <ErrorState title="Preferences unavailable" message={preferenceError} /> : null}

      <Card>
        <Eyebrow>Story preferences</Eyebrow>
        <PreferenceRow label="Interface language preference">
          <Option label="English" selected={uiLocale === 'en'} onPress={() => setPreferenceDraft((current) => ({ ...current, uiLocale: 'en' }))} />
          <Option label="Tiếng Việt" selected={uiLocale === 'vi'} onPress={() => setPreferenceDraft((current) => ({ ...current, uiLocale: 'vi' }))} />
        </PreferenceRow>
        <PreferenceRow label="New story language">
          <Option label="English" selected={storyLocale === 'en-US'} onPress={() => setPreferenceDraft((current) => ({ ...current, storyLocale: 'en-US' }))} />
          <Option label="Tiếng Việt" selected={storyLocale === 'vi-VN'} onPress={() => setPreferenceDraft((current) => ({ ...current, storyLocale: 'vi-VN' }))} />
        </PreferenceRow>
        <PreferenceRow label="Narrator">
          <Option label="English female" selected={narratorVariant === 'en-narrator-female'} onPress={() => setPreferenceDraft((current) => ({ ...current, narratorVariant: 'en-narrator-female' }))} />
          <Option label="Vietnamese female" selected={narratorVariant === 'vi-narrator-female'} onPress={() => setPreferenceDraft((current) => ({ ...current, narratorVariant: 'vi-narrator-female' }))} />
        </PreferenceRow>
        <Text style={styles.note}>Story language and narrator apply now. Full translated interface copy is a later localization slice.</Text>
        <ActionButton label="Save preferences" busy={busy === 'preferences' || loading} onPress={() => void savePreferences()} />
      </Card>

      <Card>
        <View style={styles.rowBetween}>
          <Eyebrow>Privacy & data</Eyebrow>
          <Pill tone={account.configured ? 'success' : 'neutral'}>{account.configured ? 'Live account' : 'Preview only'}</Pill>
        </View>
        <Text style={styles.body}>D1 stores canonical story/application state. Narration stays in private R2. Product analytics intentionally omit user IDs and story text.</Text>
        <Text style={styles.body}>Export includes your application-owned story data but never auth tokens, provider secrets, telemetry rows, private R2 object keys, or raw RevenueCat webhook bodies.</Text>
        <Text style={styles.body}>Delete removes Living Plot D1 data and owned private audio. It does not claim to delete the separate Clerk or RevenueCat provider account.</Text>
        <ActionButton label="Export my Living Plot data" variant="secondary" busy={busy === 'export'} disabled={!account.configured} onPress={() => void exportData()} />
      </Card>

      <Card style={styles.dangerCard}>
        <Eyebrow>Irreversible data erase</Eyebrow>
        <Text style={styles.dangerTitle}>Delete Living Plot application data</Text>
        <Text style={styles.body}>Type the exact phrase below. Private audio cleanup must succeed before canonical D1 deletion is allowed.</Text>
        <Text style={styles.confirmPhrase}>{ACCOUNT_DELETE_CONFIRMATION}</Text>
        <TextInput
          accessibilityLabel="Account deletion confirmation"
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="Type confirmation phrase"
          placeholderTextColor={colors.placeholder}
          style={styles.input}
          value={confirmation}
          onChangeText={setConfirmation}
        />
        <ActionButton
          label="Delete my Living Plot data"
          variant="secondary"
          busy={busy === 'delete'}
          disabled={!account.configured || postDeleteSignOutFailed || confirmation !== ACCOUNT_DELETE_CONFIRMATION}
          onPress={() => void deleteData()}
        />
        {postDeleteSignOutFailed ? (
          <ActionButton label="Retry Clerk sign out" busy={busy === 'signout'} onPress={() => void retrySignOut()} />
        ) : null}
      </Card>

      <Card>
        <View style={styles.rowBetween}>
          <Eyebrow>Safe diagnostics</Eyebrow>
          <Pill>{runtimeMode}</Pill>
        </View>
        <Diagnostic label="App version" value={Constants.expoConfig?.version ?? 'unknown'} />
        <Diagnostic label="API" value={apiBaseUrl ? 'configured' : 'not configured'} />
        <Diagnostic label="Clerk" value={auth.configured ? auth.isSignedIn ? 'signed in' : 'configured' : 'not configured'} />
        <Diagnostic label="RevenueCat" value={revenueCatMode} />
        <Diagnostic label="API health" value={apiHealth} />
        <View style={styles.actions}>
          <ActionButton label="Check API health" variant="secondary" busy={busy === 'health'} disabled={!apiBaseUrl} onPress={() => void checkHealth()} style={styles.flex} />
          <ActionButton label="Share diagnostics" variant="ghost" onPress={() => void Share.share({ message: diagnostics })} />
        </View>
        <Text style={styles.note}>Diagnostics contain status booleans/version only—no tokens, internal user IDs, API URL, story text, or secret values.</Text>
      </Card>

      {message ? <Text style={styles.message} accessibilityLiveRegion="polite">{message}</Text> : null}
    </Screen>
  );
}

function PreferenceRow({ label, children }: { label: string; children: ReactNode }) {
  return <View style={styles.preferenceRow}><Text style={styles.label}>{label}</Text><View style={styles.options}>{children}</View></View>;
}

function Option({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.pressed]}
    >
      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function Diagnostic({ label, value }: { label: string; value: string }) {
  return <View style={styles.rowBetween}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}

function revenueCatStoreModeFromEnvForRuntime(): string {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return 'not_configured';
  try { return revenueCatStoreModeFromEnv(Platform.OS); } catch { return 'not_configured'; }
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hero: { gap: spacing.sm },
  title: { color: colors.ink, fontSize: 32, lineHeight: 38, fontWeight: '900' },
  body: { color: colors.inkMuted, fontSize: 14, lineHeight: 22 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  preferenceRow: { gap: spacing.sm },
  label: { color: colors.inkMuted, fontSize: 12, fontWeight: '800' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised },
  optionSelected: { borderColor: colors.accent, backgroundColor: colors.surfaceWarmDeep },
  optionText: { color: colors.inkMuted, fontSize: 13, fontWeight: '800' },
  optionTextSelected: { color: colors.accentStrong },
  pressed: { opacity: 0.75 },
  dangerCard: { borderColor: colors.danger, backgroundColor: colors.surfaceDanger },
  dangerTitle: { color: colors.danger, fontSize: 21, lineHeight: 27, fontWeight: '900' },
  confirmPhrase: { color: colors.ink, fontSize: 12, lineHeight: 18, fontWeight: '900', letterSpacing: 0.4 },
  input: { minHeight: 48, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.ink, backgroundColor: colors.surface },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  value: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  note: { color: colors.quietInk, fontSize: 11, lineHeight: 17 },
  message: { color: colors.inkMuted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
});
