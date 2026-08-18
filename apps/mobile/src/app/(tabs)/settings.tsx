import { useMemo, useState, type ReactNode } from 'react';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { ACCOUNT_DELETE_CONFIRMATION } from '@/features/account/contracts';
import { deleteAccountThenSignOut } from '@/features/account/delete-flow';
import { HttpAccountDataClient, UnavailableAccountDataClient } from '@/features/account/http-account-client';
import { useMobileAuth } from '@/features/auth/mobile-auth-context';
import { useUiCopy } from '@/features/localization/ui-copy';
import { revenueCatStoreModeFromEnv } from '@/features/billing/revenuecat-config';
import type { DramaLocale, NarratorVariant, UiLocale } from '@/features/preferences/contracts';
import { useUserPreferences } from '@/features/preferences/preferences-context';
import { ActionButton, BrandMark, ErrorState, Pill, Screen } from '@/ui/primitives';
import { colors, cinematic, radius, spacing, typography } from '@/ui/theme';

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
    dramaLocale: DramaLocale;
    narratorVariant: NarratorVariant;
  }>>({});
  const uiLocale = preferenceDraft.uiLocale ?? preferences.uiLocale;
  const dramaLocale = preferenceDraft.dramaLocale ?? preferences.dramaLocale;
  const narratorVariant = preferenceDraft.narratorVariant ?? preferences.narratorVariant;
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<'preferences' | 'export' | 'delete' | 'signout' | 'health' | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [postDeleteSignOutFailed, setPostDeleteSignOutFailed] = useState(false);
  const [apiHealth, setApiHealth] = useState<'unchecked' | 'ok' | 'unreachable'>(apiBaseUrl ? 'unchecked' : 'unreachable');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  async function savePreferences() {
    setBusy('preferences');
    setMessage(null);
    try {
      await save({ uiLocale, dramaLocale, narratorVariant });
      setPreferenceDraft({});
      setMessage(uiLocale === 'vi'
        ? 'Đã lưu tùy chọn. Drama hiện có vẫn giữ ngôn ngữ ban đầu.'
        : 'Preferences saved. Existing dramas keep their original drama language.');
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
      <BrandMark />

      <View style={styles.settingsIntro}>
        <Text style={styles.settingsKicker}>{t('YOUR EXPERIENCE', 'TRẢI NGHIỆM CỦA BẠN')}</Text>
        <Text style={styles.settingsTitle}>{t('Make Living Plot feel like yours.', 'Biến Living Plot thành không gian của bạn.')}</Text>
        <Text style={styles.settingsBody}>{t('Language and narration affect new scenes. Your existing drama canon stays untouched.', 'Ngôn ngữ và giọng kể áp dụng cho cảnh mới. Cốt truyện đã có vẫn được giữ nguyên.')}</Text>
      </View>

      {preferenceError ? <ErrorState title={t('Preferences unavailable', 'Tùy chọn không khả dụng')} message={locale === 'vi' ? t('Preferences could not be loaded.', 'Không thể tải tùy chọn.') : preferenceError} /> : null}

      <View style={styles.section}>
        <SectionHeader index="01" title={t('Drama defaults', 'Mặc định drama')} meta={t('NEW REQUESTS', 'YÊU CẦU MỚI')} />
        <PreferenceRow label={t('Interface language', 'Ngôn ngữ giao diện')}>
          <Option locale={locale} label="English" selected={uiLocale === 'en'} onPress={() => setPreferenceDraft((current) => ({ ...current, uiLocale: 'en', dramaLocale: 'en-US', narratorVariant: 'en-narrator-female' }))} />
          <Option locale={locale} label="Tiếng Việt" selected={uiLocale === 'vi'} onPress={() => setPreferenceDraft((current) => ({ ...current, uiLocale: 'vi', dramaLocale: 'vi-VN', narratorVariant: 'vi-narrator-female' }))} />
        </PreferenceRow>
        <PreferenceRow label={t('New drama language', 'Ngôn ngữ drama mới')}>
          <Option locale={locale} label="English" selected={dramaLocale === 'en-US'} onPress={() => setPreferenceDraft((current) => ({ ...current, dramaLocale: 'en-US' }))} />
          <Option locale={locale} label="Tiếng Việt" selected={dramaLocale === 'vi-VN'} onPress={() => setPreferenceDraft((current) => ({ ...current, dramaLocale: 'vi-VN' }))} />
        </PreferenceRow>
        <PreferenceRow label={t('Narrator', 'Giọng kể')}>
          <Option locale={locale} label={t('English female', 'Nữ tiếng Anh')} selected={narratorVariant === 'en-narrator-female'} onPress={() => setPreferenceDraft((current) => ({ ...current, narratorVariant: 'en-narrator-female' }))} />
          <Option locale={locale} label={t('Vietnamese female', 'Nữ tiếng Việt')} selected={narratorVariant === 'vi-narrator-female'} onPress={() => setPreferenceDraft((current) => ({ ...current, narratorVariant: 'vi-narrator-female' }))} />
        </PreferenceRow>
        <Text style={styles.compactNote}>{t('Saved changes affect future requests only.', 'Thay đổi đã lưu chỉ áp dụng cho yêu cầu tương lai.')}</Text>
        <ActionButton label={t('Save preferences', 'Lưu tùy chọn')} busy={busy === 'preferences' || loading} onPress={() => void savePreferences()} />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionStatusHeader}>
          <SectionHeader index="02" title={t('Privacy & data', 'Quyền riêng tư & dữ liệu')} meta={t('OWNED DATA', 'DỮ LIỆU SỞ HỮU')} />
          <Pill tone={account.configured ? 'success' : 'neutral'}>{account.configured ? t('Connected', 'Đã kết nối') : t('Preview only', 'Chỉ xem trước')}</Pill>
        </View>
        <View style={styles.policyGrid}>
          <PolicyTile kicker={t('DRAMAS', 'DRAMA')} title={t('Your drama history', 'Lịch sử drama')} body={t('Dramas and locked choices stay attached to your account.', 'Drama và lựa chọn đã chốt luôn gắn với tài khoản của bạn.')} />
          <PolicyTile kicker={t('VOICE', 'GIỌNG ĐỌC')} title={t('Private narration', 'Giọng đọc riêng tư')} body={t('Generated narration remains private and is cleaned up with your account.', 'Giọng đọc đã tạo được giữ riêng tư và dọn cùng tài khoản của bạn.')} />
          <PolicyTile kicker={t('PRIVACY', 'RIÊNG TƯ')} title={t('No drama text in analytics', 'Không đưa nội dung drama vào analytics')} body={t('Exports exclude auth tokens, provider secrets, telemetry rows and private object keys.', 'Bản xuất loại trừ token, secret nhà cung cấp, telemetry và khóa object riêng tư.')} />
        </View>
        <ActionButton label={t('Export my Living Plot data', 'Xuất dữ liệu Living Plot của tôi')} variant="secondary" busy={busy === 'export'} disabled={!account.configured} onPress={() => void exportData()} />
      </View>

      <View style={styles.dangerVault}>
        <View style={styles.dangerHeader}>
          <View style={styles.dangerHeaderCopy}>
            <Text style={styles.dangerKicker}>{t('IRREVERSIBLE', 'KHÔNG THỂ HOÀN TÁC')}</Text>
            <Text style={styles.dangerTitle}>{t('Erase Living Plot data', 'Xóa dữ liệu Living Plot')}</Text>
          </View>
        </View>
        <Text style={styles.dangerBody}>{t('Private narration is cleaned up before your drama data is erased. Type the exact phrase to unlock the action.', 'Giọng đọc riêng tư được dọn trước khi dữ liệu drama bị xóa. Nhập chính xác cụm từ để mở khóa thao tác.')}</Text>
        <View style={styles.confirmDock}>
          <Text style={styles.confirmLabel}>{t('CONFIRMATION PHRASE', 'CỤM TỪ XÁC NHẬN')}</Text>
          <Text style={styles.confirmPhrase}>{ACCOUNT_DELETE_CONFIRMATION}</Text>
          <TextInput
            accessibilityLabel={t('Account deletion confirmation', 'Xác nhận xóa dữ liệu tài khoản')}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder={t('Type confirmation phrase', 'Nhập cụm từ xác nhận')}
            placeholderTextColor={colors.placeholder}
            style={styles.dangerInput}
            value={confirmation}
            onChangeText={setConfirmation}
          />
        </View>
        <ActionButton
          label={t('Delete my Living Plot data', 'Xóa dữ liệu Living Plot của tôi')}
          variant="secondary"
          busy={busy === 'delete'}
          disabled={!account.configured || postDeleteSignOutFailed || confirmation !== ACCOUNT_DELETE_CONFIRMATION}
          onPress={() => void deleteData()}
        />
        {postDeleteSignOutFailed ? <ActionButton label={t('Retry Clerk sign out', 'Thử đăng xuất Clerk lại')} busy={busy === 'signout'} onPress={() => void retrySignOut()} /> : null}
      </View>

      <View style={styles.advancedGate}>
        <View style={styles.advancedCopy}>
          <Text style={styles.advancedTitle}>{t('Advanced & diagnostics', 'Nâng cao & chẩn đoán')}</Text>
          <Text style={styles.compactNote}>{t('Technical status for testing and support.', 'Trạng thái kỹ thuật dành cho kiểm thử và hỗ trợ.')}</Text>
        </View>
        <ActionButton
          label={advancedOpen ? t('Hide', 'Ẩn') : t('Open', 'Mở')}
          variant="ghost"
          onPress={() => setAdvancedOpen((current) => !current)}
        />
      </View>

      {advancedOpen ? (
        <View style={styles.section}>
          <View style={styles.sectionStatusHeader}>
            <SectionHeader index="03" title={t('Safe diagnostics', 'Chẩn đoán an toàn')} meta={t('STATUS ONLY', 'CHỈ TRẠNG THÁI')} />
            <Pill tone={apiHealth === 'ok' ? 'success' : 'neutral'}>{runtimeMode === 'live' ? t('Live', 'Trực tuyến') : t('Preview', 'Xem trước')}</Pill>
          </View>
          <View style={styles.console}>
            <Text style={styles.consoleHeader}>LIVING_PLOT / SAFE_DIAGNOSTICS</Text>
            <Diagnostic label={t('App version', 'Phiên bản ứng dụng')} value={Constants.expoConfig?.version ?? t('unknown', 'không rõ')} />
            <Diagnostic label="API" value={apiBaseUrl ? t('configured', 'đã cấu hình') : t('not configured', 'chưa cấu hình')} />
            <Diagnostic label="Clerk" value={auth.configured ? auth.isSignedIn ? t('signed in', 'đã đăng nhập') : t('configured', 'đã cấu hình') : t('not configured', 'chưa cấu hình')} />
            <Diagnostic label="RevenueCat" value={revenueCatMode} />
            <Diagnostic label={t('API health', 'Trạng thái API')} value={apiHealth} />
          </View>
          <View style={styles.actions}>
            <ActionButton label={t('Check API health', 'Kiểm tra API')} variant="secondary" busy={busy === 'health'} disabled={!apiBaseUrl} onPress={() => void checkHealth()} style={styles.flexAction} />
            <ActionButton label={t('Share diagnostics', 'Chia sẻ chẩn đoán')} variant="ghost" onPress={() => void Share.share({ message: diagnostics })} style={styles.flexAction} />
          </View>
          <Text style={styles.compactNote}>{t('No tokens, internal user IDs, API URL, drama text or secret values are included.', 'Không gồm token, ID người dùng nội bộ, URL API, nội dung drama hay secret.')}</Text>
        </View>
      ) : null}

      {message ? <Text style={styles.message} accessibilityLiveRegion="polite">{message}</Text> : null}
    </Screen>
  );
}

function SectionHeader({ index, title, meta }: { index: string; title: string; meta: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionIndex}>{index}</Text>
      <View style={styles.sectionHeaderCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionMeta}>{meta}</Text>
      </View>
    </View>
  );
}

function PreferenceRow({ label, children }: { label: string; children: ReactNode }) {
  return <View style={styles.preferenceRow}><Text style={styles.preferenceLabel}>{label}</Text><View style={styles.options}>{children}</View></View>;
}

function Option({ locale, label, selected, onPress }: { locale: UiLocale; label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.pressed]}
    >
      <View style={[styles.optionSignal, selected && styles.optionSignalSelected]} />
      <Text style={[styles.optionText, selected && styles.optionTextSelected]} numberOfLines={2}>{label}</Text>
      <Text style={styles.optionState}>{selected ? (locale === 'vi' ? 'ĐÃ CHỌN' : 'SELECTED') : (locale === 'vi' ? 'TÙY CHỌN' : 'OPTION')}</Text>
    </Pressable>
  );
}

function PolicyTile({ kicker, title, body }: { kicker: string; title: string; body: string }) {
  return (
    <View style={styles.policyTile}>
      <Text style={styles.policyKicker}>{kicker}</Text>
      <Text style={styles.policyTitle}>{title}</Text>
      <Text style={styles.policyBody}>{body}</Text>
    </View>
  );
}

function Diagnostic({ label, value }: { label: string; value: string }) {
  return <View style={styles.diagnosticRow}><Text style={styles.diagnosticLabel}>{label}</Text><Text style={styles.diagnosticValue}>{value}</Text></View>;
}

function revenueCatStoreModeFromEnvForRuntime(): string {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return 'not_configured';
  try { return revenueCatStoreModeFromEnv(Platform.OS); } catch { return 'not_configured'; }
}

const styles = StyleSheet.create({
  settingsIntro: { gap: spacing.sm, paddingVertical: spacing.md },
  settingsKicker: { color: colors.accentStrong, fontFamily: typography.mono, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  settingsTitle: { maxWidth: 560, color: colors.ink, fontFamily: typography.display, fontSize: 26, lineHeight: 31, fontWeight: '700', letterSpacing: -0.4 },
  settingsBody: { maxWidth: 560, color: colors.inkMuted, fontSize: 13, lineHeight: 20 },
  advancedGate: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong },
  advancedCopy: { flex: 1, minWidth: 190, gap: 4 },
  advancedTitle: { color: colors.ink, fontFamily: typography.display, fontSize: 20, lineHeight: 24, fontWeight: '700' },
  section: { gap: spacing.md, paddingVertical: spacing.xl, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong },
  sectionStatusHeader: { gap: spacing.sm },
  sectionHeader: { width: '100%', minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  sectionIndex: { width: 28, flexShrink: 0, color: colors.accentStrong, fontFamily: typography.mono, fontSize: 9, lineHeight: 17, fontWeight: '900', letterSpacing: 1.2 },
  sectionHeaderCopy: { minWidth: 0, flex: 1, gap: 2 },
  sectionTitle: { flexShrink: 1, color: colors.ink, fontFamily: typography.display, fontSize: 20, lineHeight: 24, fontWeight: '700' },
  sectionMeta: { color: colors.quietInk, fontFamily: typography.mono, fontSize: 8, lineHeight: 13, fontWeight: '900', letterSpacing: 0.8 },
  preferenceRow: { gap: spacing.sm },
  preferenceLabel: { color: colors.inkMuted, fontFamily: typography.mono, fontSize: 9, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: { minWidth: 140, minHeight: 104, flexGrow: 1, flexBasis: '46%', justifyContent: 'space-between', gap: spacing.sm, padding: spacing.md, borderRadius: cinematic.radius.choice, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, backgroundColor: colors.surfaceQuiet },
  optionSelected: { borderColor: colors.accentSoft, backgroundColor: colors.surfaceWarmDeep },
  optionSignal: { width: 28, height: 2, borderRadius: radius.pill, backgroundColor: colors.borderStrong },
  optionSignalSelected: { backgroundColor: colors.accentStrong },
  optionText: { color: colors.inkMuted, fontFamily: typography.display, fontSize: 17, lineHeight: 21, fontWeight: '700' },
  optionTextSelected: { color: colors.ink },
  optionState: { color: colors.quietInk, fontFamily: typography.mono, fontSize: 7, fontWeight: '900', letterSpacing: 0.8 },
  pressed: { opacity: 0.76 },
  compactNote: { color: colors.quietInk, fontSize: 11, lineHeight: 17 },
  policyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  policyTile: { minWidth: 150, flexGrow: 1, flexBasis: '30%', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, backgroundColor: colors.surfaceQuiet },
  policyKicker: { color: colors.accentStrong, fontFamily: typography.mono, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  policyTitle: { color: colors.ink, fontFamily: typography.display, fontSize: 18, lineHeight: 22, fontWeight: '700' },
  policyBody: { color: colors.inkMuted, fontSize: 11, lineHeight: 17 },
  dangerVault: { gap: spacing.md, padding: spacing.lg, overflow: 'hidden', borderRadius: cinematic.radius.scene, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.danger, backgroundColor: colors.surfaceDanger },
  dangerHeader: { width: '100%', alignItems: 'stretch' },
  dangerHeaderCopy: { width: '100%', minWidth: 0 },
  dangerKicker: { color: colors.danger, fontFamily: typography.mono, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  dangerTitle: { flexShrink: 1, marginTop: spacing.xs, color: colors.ink, fontFamily: typography.display, fontSize: 22, lineHeight: 27, fontWeight: '700' },
  dangerBody: { color: colors.narrativeInk, fontSize: 12, lineHeight: 19 },
  confirmDock: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, backgroundColor: colors.background },
  confirmLabel: { color: colors.quietInk, fontFamily: typography.mono, fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  confirmPhrase: { color: colors.danger, fontFamily: typography.mono, fontSize: 11, lineHeight: 18, fontWeight: '900', letterSpacing: 0.55 },
  dangerInput: { minHeight: 50, paddingHorizontal: 0, borderWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.danger, color: colors.ink, backgroundColor: 'transparent', fontFamily: typography.mono, fontSize: 13 },
  console: { gap: 0, overflow: 'hidden', borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, backgroundColor: '#080807' },
  consoleHeader: { color: colors.accentStrong, fontFamily: typography.mono, fontSize: 8, fontWeight: '900', letterSpacing: 1, padding: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderStrong },
  diagnosticRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
  diagnosticLabel: { color: colors.quietInk, fontFamily: typography.mono, fontSize: 9, lineHeight: 14, fontWeight: '800' },
  diagnosticValue: { color: colors.ink, fontFamily: typography.mono, fontSize: 9, lineHeight: 14, fontWeight: '900' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  flexAction: { minWidth: 150, flexGrow: 1 },
  message: { color: colors.inkMuted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
});
