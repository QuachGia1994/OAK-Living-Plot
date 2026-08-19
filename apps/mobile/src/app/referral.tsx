import { useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useMobileAuth } from '@/features/auth/mobile-auth-context';
import { useUiCopy } from '@/features/localization/ui-copy';
import { HttpReferralClient, ReferralClientError } from '@/features/referrals/referral-client';
import { ActionButton, BrandMark, Eyebrow, ErrorState, Screen } from '@/ui/primitives';
import { colors, radius, spacing, typography } from '@/ui/theme';

export default function ReferralScreen() {
  const router = useRouter();
  const auth = useMobileAuth();
  const { t } = useUiCopy();
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const initialCode = readParam(params.code)?.toUpperCase() ?? '';
  const [code, setCode] = useState(initialCode);
  const apiBaseUrl = process.env.EXPO_PUBLIC_LIVING_PLOT_API_URL?.trim() ?? '';
  const client = useMemo(() => apiBaseUrl && auth.configured ? new HttpReferralClient(apiBaseUrl, auth.getToken) : null, [apiBaseUrl, auth.configured, auth.getToken]);
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function claim() {
    if (!client || !code) return;
    setBusy(true);
    setMessage(null);
    try {
      await client.claim(code);
      setClaimed(true);
      setMessage(t('Invite linked. If this account activates Plus, the inviter receives 50 cloud narration credits.', 'Đã liên kết lời mời. Khi tài khoản này kích hoạt Plus, người mời sẽ nhận 50 lượt giọng cloud.'));
    } catch (error) {
      setMessage(referralMessage(error, t));
    } finally {
      setBusy(false);
    }
  }

  const validCode = /^[A-Z0-9]{8,24}$/u.test(code.trim().toUpperCase());

  return (
    <Screen>
      <BrandMark />
      <View style={styles.hero}>
        <Eyebrow>{t('LIVING PLOT INVITE', 'LỜI MỜI LIVING PLOT')}</Eyebrow>
        <Text style={styles.title}>{t('A story is waiting for you.', 'Một câu chuyện đang chờ bạn.')}</Text>
        <Text style={styles.body}>{t('Join with this invite. If you later activate Plus, the person who invited you receives 50 extra cloud narration credits.', 'Tham gia bằng lời mời này. Nếu sau đó bạn kích hoạt Plus, người đã mời bạn sẽ nhận thêm 50 lượt giọng cloud.')}</Text>
      </View>

      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>{t('INVITE CODE', 'MÃ GIỚI THIỆU')}</Text>
        <TextInput
          accessibilityLabel={t('Referral code', 'Mã giới thiệu')}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={24}
          placeholder="ABCDEFGH"
          placeholderTextColor={colors.placeholder}
          style={styles.codeInput}
          value={code}
          onChangeText={(value) => {
            setCode(value.toUpperCase().replace(/[^A-Z0-9]/gu, ''));
            setClaimed(false);
            setMessage(null);
          }}
        />
      </View>

      {!auth.configured ? (
        <ErrorState title={t('Live account required', 'Cần tài khoản live')} message={t('Referral claims are unavailable in preview builds.', 'Không thể nhận mã giới thiệu trong bản preview.')} />
      ) : !auth.isLoaded ? (
        <Text style={styles.body}>{t('Opening your account…', 'Đang mở tài khoản…')}</Text>
      ) : !auth.isSignedIn ? (
        <ActionButton
          label={t('Sign in and keep this invite', 'Đăng nhập và giữ lời mời')}
          disabled={!validCode}
          onPress={() => router.push({ pathname: '/auth', params: { returnTo: 'referral', referralCode: code.trim().toUpperCase() } })}
        />
      ) : (
        <ActionButton
          label={claimed ? t('Invite linked', 'Đã liên kết lời mời') : t('Use this invite', 'Dùng lời mời này')}
          busy={busy}
          disabled={claimed || !validCode}
          onPress={() => void claim()}
        />
      )}

      {message ? <Text style={styles.message} accessibilityLiveRegion="polite">{message}</Text> : null}
      <ActionButton label={t('Open Living Plot', 'Mở Living Plot')} variant="ghost" onPress={() => router.replace('/')} />
    </Screen>
  );
}

type Translate = (en: string, vi: string) => string;

function referralMessage(error: unknown, t: Translate): string {
  if (!(error instanceof ReferralClientError)) return t('This invite could not be linked.', 'Không thể liên kết lời mời này.');
  if (error.code === 'self_referral') return t('You cannot use your own invite code.', 'Bạn không thể dùng mã giới thiệu của chính mình.');
  if (error.code === 'already_claimed') return t('This account already has an invite linked.', 'Tài khoản này đã liên kết một lời mời khác.');
  if (error.code === 'plus_already_active') return t('Referral codes must be linked before this account activates Plus.', 'Mã giới thiệu phải được liên kết trước khi tài khoản này kích hoạt Plus.');
  if (error.code === 'not_found' || error.code === 'invalid_code') return t('This invite code is not valid.', 'Mã giới thiệu này không hợp lệ.');
  return t('Referral service is temporarily unavailable.', 'Dịch vụ giới thiệu tạm thời không khả dụng.');
}

function readParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return value?.trim() || null;
}

const styles = StyleSheet.create({
  hero: { gap: spacing.sm, paddingVertical: spacing.lg },
  title: { color: colors.ink, fontFamily: typography.display, fontSize: 30, lineHeight: 36, fontWeight: '700' },
  body: { color: colors.inkMuted, fontSize: 14, lineHeight: 22 },
  codeCard: { gap: spacing.xs, padding: spacing.lg, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.accentSoft, backgroundColor: colors.surfaceWarmDeep },
  codeLabel: { color: colors.quietInk, fontFamily: typography.mono, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  codeInput: { minHeight: 52, paddingHorizontal: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.accentSoft, color: colors.accentStrong, fontFamily: typography.mono, fontSize: 24, lineHeight: 30, fontWeight: '900', letterSpacing: 2 },
  message: { color: colors.inkMuted, fontSize: 12, lineHeight: 19 },
});
