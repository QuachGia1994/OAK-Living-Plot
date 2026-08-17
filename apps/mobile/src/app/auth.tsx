import { useSignIn, useSignUp } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useMobileAuth } from '@/features/auth/mobile-auth-context';
import { useUiCopy } from '@/features/localization/ui-copy';
import { DramaLoadingStage, DramaUtilityHero } from '@/ui/drama-visuals';
import { ActionButton, BrandMark, Screen } from '@/ui/primitives';
import { colors, cinematic, spacing, typography } from '@/ui/theme';

export default function AuthScreen() {
  const auth = useMobileAuth();
  const router = useRouter();
  const { t } = useUiCopy();

  if (!auth.configured) {
    return (
      <Screen>
        <BrandMark />
        <DramaUtilityHero
          kicker={t('PREVIEW IDENTITY', 'DANH TÍNH BẢN XEM TRƯỚC')}
          title={t('The drama works. Account sync waits for live services.', 'Drama vẫn chạy. Đồng bộ tài khoản chờ dịch vụ live.')}
          detail={t('Explore the complete story flow now; sign-in appears when Clerk is connected.', 'Khám phá toàn bộ luồng câu chuyện ngay; đăng nhập sẽ xuất hiện khi Clerk được kết nối.')}
          mood="mysterious"
          characterName="Preview"
        />
        <ActionButton label={t('Back to preview', 'Quay lại bản xem trước')} onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  if (!auth.isLoaded) {
    return (
      <Screen>
        <BrandMark />
        <DramaLoadingStage label={t('Opening secure session…', 'Đang mở phiên đăng nhập…')} detail={t('Restoring your identity without touching story state.', 'Đang khôi phục danh tính mà không thay đổi trạng thái câu chuyện.')} />
      </Screen>
    );
  }

  if (auth.isSignedIn) {
    return (
      <Screen>
        <BrandMark />
        <DramaUtilityHero
          kicker={t('IDENTITY LINKED', 'ĐÃ LIÊN KẾT DANH TÍNH')}
          title={t('Your stories can follow you.', 'Câu chuyện có thể đi cùng bạn.')}
          detail={t('Return to Living Plot and continue from your canonical choices.', 'Quay lại Living Plot và tiếp tục từ những lựa chọn chuẩn của bạn.')}
          mood="hopeful"
          characterName="Signed in"
        />
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
      <DramaUtilityHero
        kicker={verifying ? t('ONE-TIME CODE', 'MÃ DÙNG MỘT LẦN') : t('KEEP YOUR PLOT', 'GIỮ CỐT TRUYỆN')}
        title={verifying ? t('Check your email.', 'Kiểm tra email.') : t('Continue with email.', 'Tiếp tục bằng email.')}
        detail={verifying
          ? t(`Code sent to ${email.trim()}.`, `Mã đã gửi tới ${email.trim()}.`)
          : t('One email code links plots, choices and progress to your account.', 'Một mã email sẽ liên kết cốt truyện, lựa chọn và tiến độ với tài khoản.')}
        mood={verifying ? 'hopeful' : 'mysterious'}
        characterName={verifying ? 'Verify' : 'Identity'}
      />

      <View style={styles.authDock}>
        <View style={styles.fieldHeader}>
          <Text style={styles.fieldKicker}>{verifying ? t('VERIFICATION CODE', 'MÃ XÁC MINH') : 'EMAIL'}</Text>
          <Text style={styles.fieldMeta}>{verifying ? t('6 DIGITS', '6 CHỮ SỐ') : t('PASSWORDLESS', 'KHÔNG MẬT KHẨU')}</Text>
        </View>

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
            style={styles.codeInput}
            value={code}
            onChangeText={setCode}
            onSubmitEditing={() => void verifyCode()}
          />
        )}

        {message ? <Text style={styles.error} accessibilityLiveRegion="polite">{message}</Text> : null}

        <ActionButton
          label={verifying ? t('Verify code', 'Xác minh mã') : t('Send email code', 'Gửi mã email')}
          busy={busy}
          onPress={() => void (verifying ? verifyCode() : sendCode())}
        />

        {verifying ? (
          <View style={styles.secondaryActions}>
            <ActionButton label={t('Resend code', 'Gửi lại mã')} variant="secondary" disabled={busy} onPress={() => void signIn.emailCode.sendCode()} style={styles.secondaryButton} />
            <ActionButton label={t('Start over', 'Làm lại')} variant="ghost" disabled={busy} onPress={startOver} style={styles.secondaryButton} />
          </View>
        ) : null}
      </View>
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
  authDock: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: cinematic.radius.choice,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceQuiet,
  },
  fieldHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  fieldKicker: { color: colors.accentStrong, fontFamily: typography.mono, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  fieldMeta: { color: colors.quietInk, fontFamily: typography.mono, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  input: { minHeight: 62, paddingHorizontal: 0, borderWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.accentSoft, color: colors.ink, fontFamily: typography.display, fontSize: 21 },
  codeInput: { minHeight: 70, paddingHorizontal: 0, borderWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.accentSoft, color: colors.ink, fontFamily: typography.mono, fontSize: 28, fontWeight: '900', letterSpacing: 8 },
  secondaryActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  secondaryButton: { minWidth: 140, flexGrow: 1 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19 },
});
