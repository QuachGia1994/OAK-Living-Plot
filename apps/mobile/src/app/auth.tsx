import { useSignIn, useSignUp } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useMobileAuth } from '@/features/auth/mobile-auth-context';
import { useUiCopy } from '@/features/localization/ui-copy';
import { ActionButton, BrandMark, Card, Eyebrow, Screen } from '@/ui/primitives';
import { colors, radius, spacing } from '@/ui/theme';

export default function AuthScreen() {
  const auth = useMobileAuth();
  const router = useRouter();
  const { t } = useUiCopy();

  if (!auth.configured) {
    return (
      <Screen>
        <BrandMark />
        <Card>
          <Eyebrow>{t('Preview build', 'Bản xem trước')}</Eyebrow>
          <Text style={styles.title}>{t('Sign-in is not connected in this preview.', 'Đăng nhập chưa được kết nối trong bản xem trước.')}</Text>
          <Text style={styles.body}>{t('You can still explore the complete story flow. Account sign-in will be available once the live service is connected.', 'Bạn vẫn có thể khám phá toàn bộ luồng câu chuyện. Đăng nhập sẽ khả dụng khi dịch vụ live được kết nối.')}</Text>
        </Card>
        <ActionButton label={t('Back to preview', 'Quay lại bản xem trước')} onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  if (!auth.isLoaded) {
    return <Screen><BrandMark /><Text style={styles.body}>{t('Loading secure session…', 'Đang tải phiên đăng nhập an toàn…')}</Text></Screen>;
  }
  if (auth.isSignedIn) {
    return (
      <Screen>
        <BrandMark />
        <Card><Text style={styles.title}>{t('You’re signed in.', 'Bạn đã đăng nhập.')}</Text></Card>
        <ActionButton label={t('Open Living Plot', 'Mở Living Plot')} onPress={() => router.replace('/')} />
      </Screen>
    );
  }
  return <ClerkEmailOtpForm />;
}

function ClerkEmailOtpForm() {
  const router = useRouter();
  const { t } = useUiCopy();
  const { signIn, fetchStatus } = useSignIn();
  const { signUp, fetchStatus: signUpFetchStatus } = useSignUp();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const busy = fetchStatus === 'fetching' || signUpFetchStatus === 'fetching';

  async function sendCode() {
    const identifier = email.trim().toLocaleLowerCase();
    if (!identifier) return setMessage(t('Enter your email address.', 'Nhập địa chỉ email của bạn.'));
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
    if (!code.trim()) return setMessage(t('Enter the verification code.', 'Nhập mã xác minh.'));
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
      setMessage(t('This Clerk instance requires additional verification. Phase 1 expects email-code-only authentication.', 'Cấu hình Clerk này yêu cầu xác minh bổ sung. Phase 1 chỉ hỗ trợ xác thực bằng mã email.'));
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
    setMessage(t(`Your Clerk instance requires ${missing}. Living Plot Phase 1 expects email-only public sign-up; update Clerk Dashboard requirements before continuing.`, `Clerk đang yêu cầu ${missing}. Living Plot Phase 1 chỉ hỗ trợ đăng ký công khai bằng email; hãy cập nhật yêu cầu trong Clerk Dashboard trước khi tiếp tục.`));
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
        <Eyebrow>{t('Keep your stories with you', 'Giữ câu chuyện bên bạn')}</Eyebrow>
        <Text style={styles.title}>{verifying ? t('Check your email.', 'Kiểm tra email.') : t('Continue with email.', 'Tiếp tục bằng email.')}</Text>
        <Text style={styles.body}>
          {verifying
            ? t(`Enter the one-time code sent to ${email.trim()}.`, `Nhập mã dùng một lần đã gửi tới ${email.trim()}.`)
            : t('One email code is enough. Your plots, choices and story progress stay linked to your account.', 'Chỉ cần một mã email. Cốt truyện, lựa chọn và tiến độ sẽ gắn với tài khoản của bạn.')}
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
            placeholderTextColor={colors.placeholder}
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
            placeholderTextColor={colors.placeholder}
            style={styles.input}
            value={code}
            onChangeText={setCode}
            onSubmitEditing={() => void verifyCode()}
          />
        )}
        {message ? <Text style={styles.error}>{message}</Text> : null}
        <ActionButton
          label={verifying ? t('Verify code', 'Xác minh mã') : t('Send email code', 'Gửi mã email')}
          busy={busy}
          onPress={() => void (verifying ? verifyCode() : sendCode())}
        />
        {verifying ? (
          <>
            <ActionButton label={t('Resend code', 'Gửi lại mã')} variant="secondary" disabled={busy} onPress={() => void signIn.emailCode.sendCode()} />
            <ActionButton label={t('Start over', 'Làm lại')} variant="ghost" disabled={busy} onPress={startOver} />
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
