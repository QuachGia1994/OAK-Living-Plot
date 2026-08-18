import { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMobileAuth } from '@/features/auth/mobile-auth-context';
import { sharedUiCopy, useUiCopy } from '@/features/localization/ui-copy';
import type { BackendEntitlement } from '@/features/billing/contracts';
import { BillingClientError } from '@/features/billing/contracts';
import { useBillingSession } from '@/features/billing/billing-session-context';
import { revenueCatStoreModeFromEnv } from '@/features/billing/revenuecat-config';
import { createBillingCoordinator } from '@/features/billing/runtime';
import { DramaUtilityHero } from '@/ui/drama-visuals';
import { ActionButton, BrandMark, ErrorState, Eyebrow, Pill, Screen } from '@/ui/primitives';
import { colors, cinematic, radius, spacing, typography } from '@/ui/theme';

export default function PlusScreen() {
  const router = useRouter();
  const auth = useMobileAuth();
  const { locale, t } = useUiCopy();
  const session = useBillingSession();
  const coordinator = useMemo(() => createBillingCoordinator(), []);
  const storeMode = useMemo(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return 'not_configured' as const;
    return revenueCatStoreModeFromEnv(Platform.OS);
  }, []);
  const [busyAction, setBusyAction] = useState<'paywall' | 'restore' | 'refresh' | null>(null);
  const [entitlement, setEntitlement] = useState<BackendEntitlement | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function presentPaywall() {
    if (!session) return setMessage(t('A signed-in development build is required before the store paywall can use your canonical account ID.', 'Cần bản development đã đăng nhập để paywall dùng đúng tài khoản chuẩn của bạn.'));
    setBusyAction('paywall');
    setMessage(null);
    try {
      const result = await coordinator.presentPaywall(session);
      setEntitlement(result.entitlement);
      setMessage(result.entitlement.plusActive
        ? t('Plus access is active.', 'Quyền Plus đã hoạt động.')
        : t('The store action finished, but Plus access is still syncing. Refresh access in a moment.', 'Thao tác cửa hàng đã xong nhưng quyền Plus vẫn đang đồng bộ. Hãy làm mới sau một chút.'));
    } catch (error) {
      setMessage(billingMessage(error, locale));
    } finally {
      setBusyAction(null);
    }
  }

  async function refreshAccess() {
    if (!session) return setMessage(t('Sign in first so the backend entitlement can be read for the canonical user.', 'Đăng nhập trước để backend đọc quyền truy cập của đúng người dùng chuẩn.'));
    setBusyAction('refresh');
    setMessage(null);
    try {
      const result = await coordinator.refresh(session);
      setEntitlement(result.entitlement);
      setMessage(result.entitlement.plusActive ? t('Plus access is active.', 'Quyền Plus đang hoạt động.') : t('Your account is still on Free.', 'Tài khoản của bạn vẫn ở gói miễn phí.'));
    } catch (error) {
      setMessage(billingMessage(error, locale));
    } finally {
      setBusyAction(null);
    }
  }

  async function restore() {
    if (!session) return setMessage(t('Sign in first. Restore must be linked to the same canonical Living Plot user.', 'Đăng nhập trước. Khôi phục phải gắn với cùng người dùng Living Plot chuẩn.'));
    setBusyAction('restore');
    setMessage(null);
    try {
      const result = await coordinator.restore(session);
      setEntitlement(result.entitlement);
      setMessage(result.entitlement.plusActive ? t('Purchases restored and Plus is active.', 'Đã khôi phục giao dịch và Plus đang hoạt động.') : t('Restore completed; this account is still on Free.', 'Đã khôi phục; tài khoản này vẫn ở gói miễn phí.'));
    } catch (error) {
      setMessage(billingMessage(error, locale));
    } finally {
      setBusyAction(null);
    }
  }

  const entitlementActive = entitlement?.plusActive ?? false;

  return (
    <Screen>
      <View style={styles.topBar}>
        <BrandMark />
        <ActionButton label={sharedUiCopy.back[locale]} variant="ghost" onPress={() => router.back()} />
      </View>

      <DramaUtilityHero
        kicker="LIVING PLOT PLUS"
        title={t('Stay for the next scene.', 'Ở lại cho cảnh tiếp theo.')}
        detail={t('More daily scenes and fresh narration when the cliffhanger should not end here.', 'Thêm cảnh và giọng đọc mới mỗi ngày khi cao trào chưa nên dừng lại.')}
        mood="romantic"
        characterName="Plus"
        artworkSource={require('../../assets/living-plot-scene-mina-3d.jpg')}
      />

      <View style={styles.pass}>
        <View style={styles.passTopRow}>
          <View>
            <Eyebrow>{t('Daily drama pass', 'Thẻ drama mỗi ngày')}</Eyebrow>
            <Text style={styles.passTitle}>{entitlementActive ? t('Plus is active', 'Plus đang hoạt động') : t('Free → Plus', 'Miễn phí → Plus')}</Text>
          </View>
          <View style={styles.passPills}>
            <Pill tone={entitlementActive ? 'success' : 'accent'}>{entitlementActive ? t('PLUS ACTIVE', 'PLUS ĐANG BẬT') : t('FREE', 'MIỄN PHÍ')}</Pill>
          </View>
        </View>

        <View style={styles.metricGrid}>
          <PlanMetric locale={locale} label={t('Drama scenes', 'Cảnh drama')} free="3" plus="20" />
          <PlanMetric locale={locale} label={t('Fresh narration', 'Giọng đọc mới')} free="1" plus="10" />
        </View>

        <View style={styles.passFooter}>
          <Text style={styles.passFootnote}>{t('Replaying narration you already generated never uses another voice slot.', 'Phát lại giọng đã tạo không dùng thêm lượt giọng.')}</Text>
          {entitlement ? <Text style={styles.backendState}>{t('ACCESS', 'QUYỀN')} · {entitlement.plusActive ? 'PLUS' : t('FREE', 'MIỄN PHÍ')}</Text> : null}
        </View>
      </View>

      {!session ? (
        <ErrorState
          title={t('Sign in before upgrading', 'Đăng nhập trước khi nâng cấp')}
          message={auth.configured && auth.isSignedIn
            ? t('Your account is still opening. Try again in a moment.', 'Tài khoản vẫn đang mở. Hãy thử lại sau một chút.')
            : t('Plus needs a signed-in account so access can follow you across devices.', 'Plus cần tài khoản đã đăng nhập để quyền truy cập đi cùng bạn giữa các thiết bị.')}
        />
      ) : null}

      <View style={styles.primaryAction}>
        {auth.configured && !auth.isSignedIn ? <ActionButton label={t('Sign in with email code', 'Đăng nhập bằng mã email')} variant="secondary" onPress={() => router.push('/auth')} /> : null}
        <ActionButton label={entitlementActive ? t('Plus is ready', 'Plus đã sẵn sàng') : t('Upgrade to Plus', 'Nâng cấp lên Plus')} busy={busyAction === 'paywall'} disabled={busyAction !== null && busyAction !== 'paywall'} onPress={presentPaywall} />
      </View>

      <View style={styles.utilityBar}>
        <View style={styles.utilityCopy}>
          <Text style={styles.utilityTitle}>{t('Purchase recovery', 'Khôi phục quyền mua')}</Text>
          <Text style={styles.utilityDetail}>{storeModeDetail(storeMode, locale)}</Text>
        </View>
        <View style={styles.utilityActions}>
          <ActionButton label={t('Refresh access', 'Làm mới quyền')} variant="secondary" busy={busyAction === 'refresh'} disabled={busyAction !== null && busyAction !== 'refresh'} onPress={refreshAccess} style={styles.utilityButton} />
          <ActionButton label={t('Restore purchases', 'Khôi phục giao dịch')} variant="ghost" busy={busyAction === 'restore'} disabled={busyAction !== null && busyAction !== 'restore'} onPress={restore} style={styles.utilityButton} />
        </View>
      </View>

      {message ? <Text style={styles.message} accessibilityLiveRegion="polite">{message}</Text> : null}
    </Screen>
  );
}

function PlanMetric({ locale, label, free, plus }: { locale: 'en' | 'vi'; label: string; free: string; plus: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricTierRow}>
        <Text style={styles.metricTier}>{locale === 'vi' ? 'MIỄN PHÍ' : 'FREE'}</Text>
        <Text style={[styles.metricTier, styles.metricTierPlus]}>PLUS</Text>
      </View>
      <View style={styles.metricNumberRow}>
        <Text style={styles.metricFree}>{free}</Text>
        <Text style={styles.metricArrow}>→</Text>
        <Text style={styles.metricPlus}>{plus}</Text>
      </View>
    </View>
  );
}

function storeModeDetail(mode: 'test_store' | 'platform_store' | 'not_configured', locale: 'en' | 'vi'): string {
  if (mode === 'test_store') return locale === 'vi' ? 'Bản development đang dùng giao dịch thử.' : 'Development build uses test purchases.';
  if (mode === 'platform_store') return locale === 'vi' ? 'Cửa hàng nền tảng đã được kết nối.' : 'Platform purchases are connected.';
  return locale === 'vi' ? 'Cửa hàng chưa được kết nối trong bản này.' : 'Store connection is unavailable in this build.';
}

function billingMessage(error: unknown, locale: 'en' | 'vi'): string {
  if (error instanceof BillingClientError) return locale === 'vi' ? 'Không thể hoàn tất thao tác thanh toán. Hãy thử lại hoặc làm mới quyền truy cập.' : error.message;
  return locale === 'vi' ? 'Không thể hoàn tất thanh toán.' : 'Billing could not be completed.';
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  pass: {
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: cinematic.radius.scene,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accentSoft,
    backgroundColor: colors.surfaceWarmDeep,
  },
  passTopRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  passTitle: { marginTop: spacing.xs, color: colors.ink, fontFamily: typography.display, fontSize: 28, lineHeight: 33, fontWeight: '700' },
  passPills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metric: { minWidth: 150, flexGrow: 1, flexBasis: '46%', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, backgroundColor: colors.surfaceQuiet },
  metricLabel: { color: colors.inkMuted, fontFamily: typography.mono, fontSize: 9, lineHeight: 14, fontWeight: '900', letterSpacing: 0.75, textTransform: 'uppercase' },
  metricTierRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  metricNumberRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  metricTier: { color: colors.quietInk, fontFamily: typography.mono, fontSize: 8, lineHeight: 14, fontWeight: '900', letterSpacing: 0.8 },
  metricTierPlus: { color: colors.accentStrong },
  metricFree: { minWidth: 40, color: colors.inkMuted, fontFamily: typography.display, fontSize: 34, lineHeight: 38, fontWeight: '700', fontVariant: ['tabular-nums'] },
  metricPlus: { minWidth: 54, color: colors.accentStrong, fontFamily: typography.display, fontSize: 34, lineHeight: 38, fontWeight: '700', textAlign: 'right', fontVariant: ['tabular-nums'] },
  metricArrow: { color: colors.accentSoft, fontSize: 22, lineHeight: 38, textAlign: 'center' },
  passFooter: { gap: spacing.xs, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong },
  passFootnote: { color: colors.narrativeInk, fontSize: 12, lineHeight: 18 },
  backendState: { color: colors.success, fontFamily: typography.mono, fontSize: 9, lineHeight: 14, fontWeight: '900', letterSpacing: 0.8 },
  primaryAction: { gap: spacing.sm },
  utilityBar: { gap: spacing.md, paddingVertical: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  utilityCopy: { gap: spacing.xs },
  utilityTitle: { color: colors.ink, fontFamily: typography.display, fontSize: 20, lineHeight: 24, fontWeight: '700' },
  utilityDetail: { color: colors.quietInk, fontSize: 11, lineHeight: 17 },
  utilityActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  utilityButton: { minWidth: 145, flexGrow: 1 },
  message: { color: colors.inkMuted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
});
