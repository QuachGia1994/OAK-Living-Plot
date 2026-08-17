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
import { ActionButton, BrandMark, Card, ErrorState, Eyebrow, Pill, Screen } from '@/ui/primitives';
import { colors, spacing } from '@/ui/theme';

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
        ? t('Plus is active on the backend.', 'Plus đã hoạt động trên backend.')
        : t('Store action finished. Backend Plus is not active yet; retry refresh after RevenueCat webhook sync.', 'Thao tác cửa hàng đã xong nhưng Plus trên backend chưa hoạt động; hãy làm mới sau khi webhook RevenueCat đồng bộ.'));
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
      setMessage(result.entitlement.plusActive ? t('Backend Plus is active.', 'Backend Plus đang hoạt động.') : t('Backend entitlement is still Free.', 'Quyền truy cập trên backend vẫn là Free.'));
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
      setMessage(result.entitlement.plusActive ? t('Purchases restored and Plus is active.', 'Đã khôi phục giao dịch và Plus đang hoạt động.') : t('Restore completed; backend entitlement remains Free.', 'Đã khôi phục; quyền truy cập trên backend vẫn là Free.'));
    } catch (error) {
      setMessage(billingMessage(error, locale));
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <Screen>
      <BrandMark />
      <View style={styles.hero}>
        <Eyebrow>Living Plot Plus</Eyebrow>
        <Text style={styles.title}>{t('More episodes when the cliffhanger hits.', 'Thêm tập khi cao trào vừa tới.')}</Text>
        <Text style={styles.body}>{t('For people who want to keep a story moving instead of stopping after the free daily episodes.', 'Dành cho người muốn câu chuyện tiếp tục thay vì dừng sau số tập miễn phí mỗi ngày.')}</Text>
      </View>

      <Card>
        <View style={styles.planHeader}>
          <Pill tone="accent">PLUS</Pill>
          <Pill tone={storeMode === 'test_store' ? 'success' : 'neutral'}>{storeModeLabel(storeMode, locale)}</Pill>
        </View>
        <Text style={styles.planTitle}>{t('20 story episodes + 10 fresh narrated episodes each day', '20 tập truyện + 10 tập giọng đọc mới mỗi ngày')}</Text>
        <Text style={styles.body}>{t('Free includes 3 story episodes and 1 fresh narration per day. Replaying narration you already generated is always free.', 'Free gồm 3 tập truyện và 1 giọng đọc mới mỗi ngày. Phát lại giọng đã tạo luôn miễn phí.')}</Text>
        <Text style={styles.storeNote}>{storeMode === 'test_store' ? t('Preview purchase mode is enabled in this development build.', 'Chế độ mua thử đã bật trong bản development này.') : storeMode === 'platform_store' ? t('Purchases are connected for this platform.', 'Mua hàng đã được kết nối trên nền tảng này.') : t('Purchases are not connected in this preview build yet.', 'Mua hàng chưa được kết nối trong bản xem trước này.')}</Text>
        {entitlement ? <Pill tone={entitlement.plusActive ? 'success' : 'neutral'}>Backend: {entitlement.tier.toUpperCase()}</Pill> : null}
      </Card>

      {!session ? (
        <ErrorState
          title={t('Sign in before upgrading', 'Đăng nhập trước khi nâng cấp')}
          message={auth.configured && auth.isSignedIn
            ? t('Your account is still opening. Try again in a moment.', 'Tài khoản vẫn đang mở. Hãy thử lại sau một chút.')
            : t('Living Plot Plus needs a signed-in account so purchases can follow you across devices.', 'Living Plot Plus cần tài khoản đã đăng nhập để giao dịch theo bạn giữa các thiết bị.')}
        />
      ) : null}

      <View style={styles.actions}>
        {auth.configured && !auth.isSignedIn ? <ActionButton label={t('Sign in with email code', 'Đăng nhập bằng mã email')} variant="secondary" onPress={() => router.push('/auth')} /> : null}
        <ActionButton label={t('Open Plus paywall', 'Mở paywall Plus')} busy={busyAction === 'paywall'} onPress={presentPaywall} />
        <ActionButton label={t('Refresh access', 'Làm mới quyền truy cập')} variant="secondary" busy={busyAction === 'refresh'} onPress={refreshAccess} />
        <ActionButton label={t('Restore purchases', 'Khôi phục giao dịch')} variant="secondary" busy={busyAction === 'restore'} onPress={restore} />
        <ActionButton label={sharedUiCopy.back[locale]} variant="ghost" onPress={() => router.back()} />
      </View>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </Screen>
  );
}

function storeModeLabel(mode: 'test_store' | 'platform_store' | 'not_configured', locale: 'en' | 'vi'): string {
  if (mode === 'test_store') return 'Test Store';
  if (mode === 'platform_store') return locale === 'vi' ? 'Cửa hàng nền tảng' : 'Platform Store';
  return locale === 'vi' ? 'Cửa hàng offline' : 'Store offline';
}

function billingMessage(error: unknown, locale: 'en' | 'vi'): string {
  if (error instanceof BillingClientError) return locale === 'vi' ? 'Không thể hoàn tất thao tác thanh toán. Hãy thử lại hoặc làm mới quyền truy cập.' : error.message;
  return locale === 'vi' ? 'Không thể hoàn tất thanh toán.' : 'Billing could not be completed.';
}

const styles = StyleSheet.create({
  hero: { gap: spacing.sm },
  title: { color: colors.ink, fontSize: 32, fontWeight: '800', lineHeight: 38 },
  planHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  planTitle: { color: colors.ink, fontSize: 20, fontWeight: '800', lineHeight: 27 },
  body: { color: colors.inkMuted, fontSize: 15, lineHeight: 23 },
  storeNote: { color: colors.storyInk, fontSize: 12, lineHeight: 19 },
  actions: { gap: spacing.sm },
  message: { color: colors.inkMuted, fontSize: 14, lineHeight: 21 },
});
