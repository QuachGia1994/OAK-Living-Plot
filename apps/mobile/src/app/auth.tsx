import { useSignIn, useSignUp } from '@clerk/expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useMobileAuth } from '@/features/auth/mobile-auth-context';
import {
  beginPasswordlessEmailOtp,
  createAsyncActionGate,
  passwordlessConfigurationMessage,
  passwordlessErrorMessage,
  resendPasswordlessEmailOtp,
  resetPasswordlessEmailOtp,
  verifyPasswordlessEmailOtp,
  type PasswordlessSignInResource,
  type PasswordlessSignUpResource,
} from '@/features/auth/passwordless-email-otp';
import { useUiCopy } from '@/features/localization/ui-copy';
import { DramaLoadingStage, DramaUtilityHero } from '@/ui/drama-visuals';
import { ActionButton, BrandMark, Screen } from '@/ui/primitives';
import { colors, cinematic, spacing, typography } from '@/ui/theme';

export default function AuthScreen() {
  const auth = useMobileAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string | string[]; referralCode?: string | string[] }>();
  const referralCode = readReturnReferralCode(params.returnTo, params.referralCode);
  const { locale, t } = useUiCopy();

  if (!auth.configured) {
    return (
      <Screen>
        <BrandMark />
        <DramaUtilityHero
          kicker={t('PREVIEW IDENTITY', 'DANH TÍNH BẢN XEM TRƯỚC')}
          title={t('The drama works. Account sync waits for live services.', 'Drama vẫn chạy. Đồng bộ tài khoản chờ dịch vụ live.')}
          detail={t('Explore the complete drama flow now; sign-in appears when Clerk is connected.', 'Khám phá toàn bộ luồng drama ngay; đăng nhập sẽ xuất hiện khi Clerk được kết nối.')}
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
        <DramaLoadingStage label={t('Opening secure session…', 'Đang mở phiên đăng nhập…')} detail={t('Restoring your identity without touching drama state.', 'Đang khôi phục danh tính mà không thay đổi trạng thái drama.')} locale={locale} />
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
        <ActionButton label={referralCode ? t('Continue invite', 'Tiếp tục lời mời') : t('Open Living Plot', 'Mở Living Plot')} onPress={() => finishAuth(router, referralCode)} />
      </Screen>
    );
  }

  return <ClerkEmailOtpForm referralCode={referralCode} />;
}

function ClerkEmailOtpForm({ referralCode }: { referralCode: string | null }) {
  const router = useRouter();
  const { locale, t } = useUiCopy();
  const { signIn, fetchStatus } = useSignIn();
  const { signUp, fetchStatus: signUpFetchStatus } = useSignUp();
  const actionGate = useRef(createAsyncActionGate());
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const busy = localBusy || fetchStatus === 'fetching' || signUpFetchStatus === 'fetching';

  async function sendCode() {
    const identifier = email.trim().toLocaleLowerCase();
    if (!identifier) return setMessage(t('Enter your email address.', 'Nhập địa chỉ email của bạn.'));
    await runExclusive(async () => {
      setMessage(null);
      const outcome = await beginPasswordlessEmailOtp(
        signIn as unknown as PasswordlessSignInResource,
        signUp as unknown as PasswordlessSignUpResource,
        identifier,
      );
      if (outcome.kind === 'code_sent') setVerifying(true);
      else if (outcome.kind === 'error') setMessage(passwordlessErrorMessage(outcome.code, locale));
    });
  }

  async function verifyCode() {
    const normalizedCode = code.trim();
    if (!normalizedCode) return setMessage(t('Enter the verification code.', 'Nhập mã xác minh.'));
    await runExclusive(async () => {
      setMessage(null);
      const outcome = await verifyPasswordlessEmailOtp(
        signIn as unknown as PasswordlessSignInResource,
        signUp as unknown as PasswordlessSignUpResource,
        normalizedCode,
        () => finishAuth(router, referralCode),
      );
      if (outcome.kind === 'configuration_error') {
        setMessage(passwordlessConfigurationMessage(outcome.missingFields, locale));
      } else if (outcome.kind === 'not_complete') {
        setMessage(t('This Clerk instance requires an authentication step that Living Plot does not enable for Phase 1.', 'Cấu hình Clerk này yêu cầu thêm một bước xác thực mà Living Plot Phase 1 không bật.'));
      } else if (outcome.kind === 'error') {
        setMessage(passwordlessErrorMessage(outcome.code, locale));
      }
    });
  }

  async function resendCode() {
    await runExclusive(async () => {
      setMessage(null);
      const outcome = await resendPasswordlessEmailOtp(signIn as unknown as PasswordlessSignInResource);
      if (outcome.kind === 'error') setMessage(passwordlessErrorMessage(outcome.code, locale));
    });
  }

  async function runExclusive(action: () => Promise<void>) {
    if (actionGate.current.locked()) return;
    setLocalBusy(true);
    try {
      await actionGate.current.run(action);
    } finally {
      setLocalBusy(false);
    }
  }

  async function startOver() {
    await runExclusive(async () => {
      await resetPasswordlessEmailOtp(
        signIn as unknown as PasswordlessSignInResource,
        signUp as unknown as PasswordlessSignUpResource,
      );
      setCode('');
      setVerifying(false);
      setMessage(null);
    });
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
            accessibilityLabel={t('Email address', 'Địa chỉ email')}
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
            accessibilityLabel={t('Verification code', 'Mã xác minh')}
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
            <ActionButton label={t('Resend code', 'Gửi lại mã')} variant="secondary" disabled={busy} onPress={() => void resendCode()} style={styles.secondaryButton} />
            <ActionButton label={t('Start over', 'Làm lại')} variant="ghost" disabled={busy} onPress={() => void startOver()} style={styles.secondaryButton} />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

function readReturnReferralCode(returnTo: string | string[] | undefined, referralCode: string | string[] | undefined): string | null {
  const target = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  const code = (Array.isArray(referralCode) ? referralCode[0] : referralCode)?.trim().toUpperCase() ?? '';
  return target === 'referral' && /^[A-Z0-9]{8,24}$/u.test(code) ? code : null;
}

function finishAuth(router: ReturnType<typeof useRouter>, referralCode: string | null): void {
  if (referralCode) router.replace({ pathname: '/referral', params: { code: referralCode } });
  else router.replace('/');
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
