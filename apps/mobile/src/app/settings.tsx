import { useMemo, useState, type ReactNode } from 'react';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { ACCOUNT_DELETE_CONFIRMATION } from '@/features/account/contracts';
import { deleteAccountThenSignOut } from '@/features/account/delete-flow';
import { HttpAccountDataClient, UnavailableAccountDataClient } from '@/features/account/http-account-client';
import { useMobileAuth } from '@/features/auth/mobile-auth-context';
import { sharedUiCopy, useUiCopy } from '@/features/localization/ui-copy';
import { revenueCatStoreModeFromEnv } from '@/features/billing/revenuecat-config';
import type { NarratorVariant, StoryLocale, UiLocale } from '@/features/preferences/contracts';
import { useUserPreferences } from '@/features/preferences/preferences-context';
import { ActionButton, BrandMark, Card, ErrorState, Eyebrow, Pill, Screen } from '@/ui/primitives';
import { colors, radius, spacing, typography } from '@/ui/theme';

const unavailableAccount = new UnavailableAccountDataClient();

export default function SettingsScreen() {
  const router = useRouter();
  const auth = useMobileAuth();
  const { locale, t } = useUiCopy();
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
      setMessage(t('Preferences saved. Existing plots keep their original story locale.', 'Đã lưu tùy chọn. Cốt truyện hiện có vẫn giữ ngôn ngữ ban đầu.'));
    } catch {
      setMessage(t('Preferences could not be saved.', 'Không thể lưu tùy chọn.'));
    } finally {
      setBusy(null);
    }
  }

  async function exportData() {
    setBusy('export');
    setMessage(null);
    try {
      const snapshot = await account.loadExport();
      await Share.share({ title: t('Living Plot data export', 'Xuất dữ liệu Living Plot'), message: JSON.stringify(snapshot, null, 2) });
      setMessage(t('Your export was prepared locally for the share sheet.', 'Bản xuất dữ liệu đã được chuẩn bị cục bộ cho bảng chia sẻ.'));
    } catch (caught) {
      setMessage(caught instanceof Error && locale === 'en' ? caught.message : t('Account export could not be prepared.', 'Không thể chuẩn bị bản xuất dữ liệu.'));
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
        setMessage(t('Your Living Plot data was deleted, but this device could not sign out of Clerk. Retry sign-out before continuing to use the app.', 'Dữ liệu Living Plot đã bị xóa nhưng thiết bị này chưa thể đăng xuất Clerk. Hãy thử đăng xuất lại trước khi tiếp tục dùng ứng dụng.'));
      }
    } catch (caught) {
      setMessage(caught instanceof Error && locale === 'en' ? caught.message : t('Account data could not be deleted.', 'Không thể xóa dữ liệu tài khoản.'));
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
      setMessage(t('Your Living Plot data is already deleted, but Clerk sign-out is still unavailable on this device.', 'Dữ liệu Living Plot đã được xóa nhưng đăng xuất Clerk vẫn chưa khả dụng trên thiết bị này.'));
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
        <ActionButton label={sharedUiCopy.back[locale]} variant="ghost" onPress={() => router.back()} />
      </View>

      <View style={styles.hero}>
        <Eyebrow>{t('Settings & data', 'Cài đặt & dữ liệu')}</Eyebrow>
        <Text style={styles.title}>{t('Control the defaults. Keep the story canonical.', 'Điều khiển mặc định. Giữ câu chuyện chuẩn.')}</Text>
        <Text style={styles.body}>{t('These preferences affect new requests and narration defaults. They do not rewrite past episodes or committed choices.', 'Các tùy chọn này ảnh hưởng yêu cầu mới và giọng đọc mặc định. Chúng không viết lại tập cũ hay lựa chọn đã chốt.')}</Text>
      </View>

      {preferenceError ? <ErrorState title={t('Preferences unavailable', 'Tùy chọn không khả dụng')} message={locale === 'vi' ? t('Preferences could not be loaded.', 'Không thể tải tùy chọn.') : preferenceError} /> : null}

      <View style={styles.settingsSection}>
        <Eyebrow>{t('Story preferences', 'Tùy chọn câu chuyện')}</Eyebrow>
        <PreferenceRow label={t('Interface language', 'Ngôn ngữ giao diện')}>
          <Option label="English" selected={uiLocale === 'en'} onPress={() => setPreferenceDraft((current) => ({ ...current, uiLocale: 'en' }))} />
          <Option label="Tiếng Việt" selected={uiLocale === 'vi'} onPress={() => setPreferenceDraft((current) => ({ ...current, uiLocale: 'vi' }))} />
        </PreferenceRow>
        <PreferenceRow label={t('New story language', 'Ngôn ngữ câu chuyện mới')}>
          <Option label="English" selected={storyLocale === 'en-US'} onPress={() => setPreferenceDraft((current) => ({ ...current, storyLocale: 'en-US' }))} />
          <Option label="Tiếng Việt" selected={storyLocale === 'vi-VN'} onPress={() => setPreferenceDraft((current) => ({ ...current, storyLocale: 'vi-VN' }))} />
        </PreferenceRow>
        <PreferenceRow label={t('Narrator', 'Giọng kể')}>
          <Option label={t('English female', 'Nữ tiếng Anh')} selected={narratorVariant === 'en-narrator-female'} onPress={() => setPreferenceDraft((current) => ({ ...current, narratorVariant: 'en-narrator-female' }))} />
          <Option label={t('Vietnamese female', 'Nữ tiếng Việt')} selected={narratorVariant === 'vi-narrator-female'} onPress={() => setPreferenceDraft((current) => ({ ...current, narratorVariant: 'vi-narrator-female' }))} />
        </PreferenceRow>
        <Text style={styles.note}>{t('Interface language changes after saving. Story language applies only to new plots; narrator choice applies to new voice requests.', 'Ngôn ngữ giao diện đổi sau khi lưu. Ngôn ngữ câu chuyện chỉ áp dụng cho cốt truyện mới; giọng kể áp dụng cho yêu cầu giọng mới.')}</Text>
        <ActionButton label={t('Save preferences', 'Lưu tùy chọn')} busy={busy === 'preferences' || loading} onPress={() => void savePreferences()} />
      </View>

      <View style={styles.settingsSection}>
        <View style={styles.rowBetween}>
          <Eyebrow>{t('Privacy & data', 'Quyền riêng tư & dữ liệu')}</Eyebrow>
          <Pill tone={account.configured ? 'success' : 'neutral'}>{account.configured ? t('Live account', 'Tài khoản live') : t('Preview only', 'Chỉ xem trước')}</Pill>
        </View>
        <Text style={styles.body}>{t('D1 stores canonical story/application state. Narration stays in private R2. Product analytics intentionally omit user IDs and story text.', 'D1 lưu trạng thái ứng dụng/câu chuyện chuẩn. Giọng đọc nằm trong R2 riêng tư. Phân tích sản phẩm cố ý không lưu ID người dùng hay nội dung truyện.')}</Text>
        <Text style={styles.body}>{t('Export includes your application-owned story data but never auth tokens, provider secrets, telemetry rows, private R2 object keys, or raw RevenueCat webhook bodies.', 'Bản xuất gồm dữ liệu câu chuyện thuộc ứng dụng nhưng không bao giờ gồm token đăng nhập, secret nhà cung cấp, hàng telemetry, khóa R2 riêng tư hoặc nội dung webhook RevenueCat thô.')}</Text>
        <Text style={styles.body}>{t('Delete removes Living Plot D1 data and owned private audio. It does not claim to delete the separate Clerk or RevenueCat provider account.', 'Xóa sẽ loại bỏ dữ liệu D1 Living Plot và audio riêng tư thuộc bạn. Thao tác này không tuyên bố xóa tài khoản Clerk hay RevenueCat riêng biệt.')}</Text>
        <ActionButton label={t('Export my Living Plot data', 'Xuất dữ liệu Living Plot của tôi')} variant="secondary" busy={busy === 'export'} disabled={!account.configured} onPress={() => void exportData()} />
      </View>

      <Card style={styles.dangerCard}>
        <Eyebrow>{t('Irreversible data erase', 'Xóa dữ liệu không thể hoàn tác')}</Eyebrow>
        <Text style={styles.dangerTitle}>{t('Delete Living Plot application data', 'Xóa dữ liệu ứng dụng Living Plot')}</Text>
        <Text style={styles.body}>{t('Type the exact phrase below. Private audio cleanup must succeed before canonical D1 deletion is allowed.', 'Nhập chính xác cụm từ bên dưới. Audio riêng tư phải được dọn thành công trước khi D1 chuẩn được phép xóa.')}</Text>
        <Text style={styles.confirmPhrase}>{ACCOUNT_DELETE_CONFIRMATION}</Text>
        <TextInput
          accessibilityLabel={t('Account deletion confirmation', 'Xác nhận xóa dữ liệu tài khoản')}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder={t('Type confirmation phrase', 'Nhập cụm từ xác nhận')}
          placeholderTextColor={colors.placeholder}
          style={styles.input}
          value={confirmation}
          onChangeText={setConfirmation}
        />
        <ActionButton
          label={t('Delete my Living Plot data', 'Xóa dữ liệu Living Plot của tôi')}
          variant="secondary"
          busy={busy === 'delete'}
          disabled={!account.configured || postDeleteSignOutFailed || confirmation !== ACCOUNT_DELETE_CONFIRMATION}
          onPress={() => void deleteData()}
        />
        {postDeleteSignOutFailed ? (
          <ActionButton label={t('Retry Clerk sign out', 'Thử đăng xuất Clerk lại')} busy={busy === 'signout'} onPress={() => void retrySignOut()} />
        ) : null}
      </Card>

      <View style={styles.settingsSection}>
        <View style={styles.rowBetween}>
          <Eyebrow>{t('Safe diagnostics', 'Chẩn đoán an toàn')}</Eyebrow>
          <Pill>{runtimeMode}</Pill>
        </View>
        <Diagnostic label={t('App version', 'Phiên bản ứng dụng')} value={Constants.expoConfig?.version ?? t('unknown', 'không rõ')} />
        <Diagnostic label="API" value={apiBaseUrl ? t('configured', 'đã cấu hình') : t('not configured', 'chưa cấu hình')} />
        <Diagnostic label="Clerk" value={auth.configured ? auth.isSignedIn ? t('signed in', 'đã đăng nhập') : t('configured', 'đã cấu hình') : t('not configured', 'chưa cấu hình')} />
        <Diagnostic label="RevenueCat" value={revenueCatMode} />
        <Diagnostic label={t('API health', 'Trạng thái API')} value={apiHealth} />
        <View style={styles.actions}>
          <ActionButton label={t('Check API health', 'Kiểm tra API')} variant="secondary" busy={busy === 'health'} disabled={!apiBaseUrl} onPress={() => void checkHealth()} style={styles.flex} />
          <ActionButton label={t('Share diagnostics', 'Chia sẻ chẩn đoán')} variant="ghost" onPress={() => void Share.share({ message: diagnostics })} />
        </View>
        <Text style={styles.note}>{t('Diagnostics contain status booleans/version only; no tokens, internal user IDs, API URL, story text, or secret values.', 'Chẩn đoán chỉ chứa trạng thái boolean/phiên bản; không có token, ID người dùng nội bộ, URL API, nội dung truyện hay secret.')}</Text>
      </View>

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
  return <View style={styles.diagnosticRow}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}

function revenueCatStoreModeFromEnvForRuntime(): string {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return 'not_configured';
  try { return revenueCatStoreModeFromEnv(Platform.OS); } catch { return 'not_configured'; }
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hero: { gap: spacing.sm, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { color: colors.ink, fontFamily: typography.display, fontSize: 38, lineHeight: 44, fontWeight: '700', letterSpacing: -1 },
  body: { color: colors.inkMuted, fontSize: 14, lineHeight: 22 },
  settingsSection: { gap: spacing.md, paddingVertical: spacing.xl, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong },
  rowBetween: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  diagnosticRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
  preferenceRow: { gap: spacing.sm, paddingBottom: spacing.sm },
  label: { color: colors.inkMuted, fontFamily: typography.mono, fontSize: 10, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, borderRadius: radius.sm, backgroundColor: 'transparent' },
  optionSelected: { borderColor: colors.accent, backgroundColor: colors.surfaceWarmDeep },
  optionText: { color: colors.inkMuted, fontSize: 13, fontWeight: '800' },
  optionTextSelected: { color: colors.accentStrong },
  pressed: { opacity: 0.75 },
  dangerCard: { borderColor: colors.danger, backgroundColor: colors.surfaceDanger },
  dangerTitle: { color: colors.danger, fontFamily: typography.display, fontSize: 24, lineHeight: 30, fontWeight: '700' },
  confirmPhrase: { color: colors.ink, fontFamily: typography.mono, fontSize: 11, lineHeight: 18, fontWeight: '800', letterSpacing: 0.6 },
  input: { minHeight: 52, paddingHorizontal: 0, borderWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.danger, borderRadius: 0, color: colors.ink, backgroundColor: 'transparent', fontFamily: typography.mono, fontSize: 13 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  value: { color: colors.ink, fontFamily: typography.mono, fontSize: 10, fontWeight: '800' },
  note: { color: colors.quietInk, fontSize: 11, lineHeight: 17 },
  message: { color: colors.inkMuted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
});
