import { useSignIn, useSignUp } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useMobileAuth } from '@/features/auth/mobile-auth-context';
import { ActionButton, BrandMark, Card, Eyebrow, Screen } from '@/ui/primitives';
import { colors, radius, spacing } from '@/ui/theme';

export default function AuthScreen() {
  const auth = useMobileAuth();
  const router = useRouter();

  if (!auth.configured) {
    return (
      <Screen>
        <BrandMark />
        <Card>
          <Eyebrow>Local preview</Eyebrow>
          <Text style={styles.title}>Clerk is not configured.</Text>
          <Text style={styles.body}>Add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to switch this build from deterministic preview stories to authenticated canonical stories.</Text>
        </Card>
        <ActionButton label="Back to preview" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  if (!auth.isLoaded) {
    return <Screen><BrandMark /><Text style={styles.body}>Loading secure session…</Text></Screen>;
  }
  if (auth.isSignedIn) {
    return (
      <Screen>
        <BrandMark />
        <Card><Text style={styles.title}>You’re signed in.</Text></Card>
        <ActionButton label="Open Living Plot" onPress={() => router.replace('/')} />
      </Screen>
    );
  }
  return <ClerkEmailOtpForm />;
}

function ClerkEmailOtpForm() {
  const router = useRouter();
  const { signIn, fetchStatus } = useSignIn();
  const { signUp, fetchStatus: signUpFetchStatus } = useSignUp();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const busy = fetchStatus === 'fetching' || signUpFetchStatus === 'fetching';

  async function sendCode() {
    const identifier = email.trim().toLocaleLowerCase();
    if (!identifier) return setMessage('Enter your email address.');
    setMessage(null);
    const { error: createError } = await signIn.create({
      identifier,
      signUpIfMissing: true,
    } as Parameters<typeof signIn.create>[0]);
    if (createError) return setMessage(clerkMessage(createError));
    const { error: sendError } = await signIn.emailCode.sendCode();
    if (sendError) return setMessage(clerkMessage(sendError));
    setVerifying(true);
  }

  async function verifyCode() {
    if (!code.trim()) return setMessage('Enter the verification code.');
    setMessage(null);
    const { error } = await signIn.emailCode.verifyCode({ code: code.trim() });
    if (error) {
      if (clerkErrorCode(error) === 'sign_up_if_missing_transfer') {
        await transferToSignUp();
        return;
      }
      setMessage(clerkMessage(error));
      return;
    }
    if (signIn.status !== 'complete') {
      setMessage('This Clerk instance requires additional verification. Phase 1 expects email-code-only authentication.');
      return;
    }
    await signIn.finalize({ navigate: () => router.replace('/') });
  }

  async function transferToSignUp() {
    const { error } = await signUp.create({ transfer: true });
    if (error) return setMessage(clerkMessage(error));
    if (signUp.status === 'complete') {
      await signUp.finalize({ navigate: () => router.replace('/') });
      return;
    }
    const missing = signUp.missingFields?.join(', ') || 'additional fields';
    setMessage(`Your Clerk instance requires ${missing}. Living Plot Phase 1 expects email-only public sign-up; update Clerk Dashboard requirements before continuing.`);
  }

  function startOver() {
    signIn.reset();
    setCode('');
    setVerifying(false);
    setMessage(null);
  }

  return (
    <Screen>
      <BrandMark />
      <View style={styles.intro}>
        <Eyebrow>Canonical story identity</Eyebrow>
        <Text style={styles.title}>{verifying ? 'Check your email.' : 'Sign in or create your account.'}</Text>
        <Text style={styles.body}>
          {verifying
            ? `Enter the one-time code sent to ${email.trim()}.`
            : 'One email code signs you in. If the account does not exist yet, the verified email transfers to sign-up without exposing account existence first.'}
        </Text>
      </View>

      <Card>
        {!verifying ? (
          <TextInput
            accessibilityLabel="Email address"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor="#666169"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            onSubmitEditing={() => void sendCode()}
          />
        ) : (
          <TextInput
            accessibilityLabel="Verification code"
            autoCapitalize="none"
            keyboardType="number-pad"
            placeholder="123456"
            placeholderTextColor="#666169"
            style={styles.input}
            value={code}
            onChangeText={setCode}
            onSubmitEditing={() => void verifyCode()}
          />
        )}
        {message ? <Text style={styles.error}>{message}</Text> : null}
        <ActionButton
          label={verifying ? 'Verify code' : 'Send email code'}
          busy={busy}
          onPress={() => void (verifying ? verifyCode() : sendCode())}
        />
        {verifying ? (
          <>
            <ActionButton label="Resend code" variant="secondary" disabled={busy} onPress={() => void signIn.emailCode.sendCode()} />
            <ActionButton label="Start over" variant="ghost" disabled={busy} onPress={startOver} />
          </>
        ) : null}
      </Card>
    </Screen>
  );
}

function clerkErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('errors' in error)) return null;
  const errors = (error as { errors?: { code?: string }[] }).errors;
  return errors?.[0]?.code ?? null;
}

function clerkMessage(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('errors' in error)) return 'Authentication could not continue.';
  const errors = (error as { errors?: { longMessage?: string; message?: string }[] }).errors;
  return errors?.[0]?.longMessage ?? errors?.[0]?.message ?? 'Authentication could not continue.';
}

const styles = StyleSheet.create({
  intro: { gap: spacing.sm, paddingTop: spacing.md },
  title: { color: colors.ink, fontSize: 32, lineHeight: 38, fontWeight: '900' },
  body: { color: colors.inkMuted, fontSize: 15, lineHeight: 23 },
  input: {
    minHeight: 54,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    color: colors.ink,
    fontSize: 17,
  },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19 },
});
