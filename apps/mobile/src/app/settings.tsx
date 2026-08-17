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
import { DramaUtilityHero } from '@/ui/drama-visuals';
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

      <DramaUtilityHero
        kicker={t('CONTROL ROOM', 'PHÒNG ĐIỀU KHIỂN')}
        title={t('Set the defaults. Leave the canon untouched.', 'Đặt mặc định. Không chạm vào câu chuyện chuẩn.')}
        detail={t('Preferences shape new stories and narration; past episodes and locked choices remain unchanged.', 'Tùy chọn định hình câu chuyện và giọng đọc mới; tập cũ và lựa chọn đã chốt không thay đổi.')}
        mood="hopeful"
        characterName="Settings"
      />

      {preferenceError ? <ErrorState title={t('Preferences unavailable', 'Tùy chọn không khả dụng')} message={locale === 'vi' ? t('Preferences could not be loaded.', 'Không thể tải tùy chọn.') : preferenceError} /> : null}

      <View style={styles.section}>
        <SectionHeader index="01" title={t('Story defaults', 'Mặc định câu chuyện')} meta={t('NEW REQUESTS', 'YÊU CẦU MỚI')} />
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
        <Text style={styles.compactNote}>{t('Saved changes affect future requests only.', 'Thay đổi đã lưu chỉ áp dụng cho yêu cầu tương lai.')}</Text>
        <ActionButton label={t('Save preferences', 'Lưu tùy chọn')} busy={busy === 'preferences' || loading} onPress={() => void savePreferences()} />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionStatusHeader}>
          <SectionHeader index="02" title={t('Privacy & data', 'Quyền riêng tư & dữ liệu')} meta={t('OWNED DATA', 'DỮ LIỆU SỞ HỮU')} />
          <Pill tone={account.configured ? 'success' : 'neutral'}>{account.configured ? t('Live account', 'Tài khoản live') : t('Preview only', 'Chỉ xem trước')}</Pill>
        </View>
        <View style={styles.policyGrid}>
          <PolicyTile kicker="D1" title={t('Canonical state', 'Trạng thái chuẩn')} body={t('Stories, choices and application-owned account state.', 'Câu chuyện, lựa chọn và trạng thái tài khoản thuộc ứng dụng.')} />
          <PolicyTile kicker="R2" title={t('Private audio', 'Audio riêng tư')} body={t('Narration stays private and owned cleanup runs before account deletion.', 'Giọng đọc giữ riêng tư và được dọn trước khi xóa tài khoản.')} />
          <PolicyTile kicker={t('PRIVACY', 'RIÊNG TƯ')} title={t('No story text in analytics', 'Không đưa nội dung truyện vào analytics')} body={t('Exports exclude auth tokens, provider secrets, telemetry rows and private object keys.', 'Bản xuất loại trừ token, secret nhà cung cấp, telemetry và khóa object riêng tư.')} />
        </View>
        <ActionButton label={t('Export my Living Plot data', 'Xuất dữ liệu Living Plot của tôi')} variant="secondary" busy={busy === 'export'} disabled={!account.configured} onPress={() => void exportData()} />
      </View>

      <View style={styles.dangerVault}>
        <View style={styles.dangerHeader}>
          <View>
            <Text style={styles.dangerKicker}>{t('IRREVERSIBLE', 'KHÔNG THỂ HOÀN TÁC')}</Text>
            <Text style={styles.dangerTitle}>{t('Erase Living Plot data', 'Xóa dữ liệu Living Plot')}</Text>
          </View>
          <View style={styles.dangerSignal} />
        </View>
        <Text style={styles.dangerBody}>{t('Private audio cleanup must succeed before canonical D1 deletion. Type the exact phrase to unlock the action.', 'Audio riêng tư phải được dọn thành công trước khi xóa D1 chuẩn. Nhập chính xác cụm từ để mở khóa thao tác.')}</Text>
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

      <View style={styles.section}>
        <View style={styles.sectionStatusHeader}>
          <SectionHeader index="03" title={t('Safe diagnostics', 'Chẩn đoán an toàn')} meta={t('STATUS ONLY', 'CHỈ TRẠNG THÁI')} />
          <Pill tone={apiHealth === 'ok' ? 'success' : 'neutral'}>{runtimeMode}</Pill>
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
        <Text style={styles.compactNote}>{t('No tokens, internal user IDs, API URL, story text or secret values are included.', 'Không gồm token, ID người dùng nội bộ, URL API, nội dung truyện hay secret.')}</Text>
      </View>

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

function Option({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.pressed]}
    >
      <View style={[styles.optionSignal, selected && styles.optionSignalSelected]} />
      <Text style={[styles.optionText, selected && styles.optionTextSelected]} numberOfLines={2}>{label}</Text>
      <Text style={styles.optionState}>{selected ? 'SELECTED' : 'OPTION'}</Text>
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
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  section: { gap: spacing.md, paddingVertical: spacing.xl, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong },
  sectionStatusHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  sectionIndex: { color: colors.accentStrong, fontFamily: typography.mono, fontSize: 9, lineHeight: 17, fontWeight: '900', letterSpacing: 1.2 },
  sectionHeaderCopy: { gap: 2 },
  sectionTitle: { color: colors.ink, fontFamily: typography.display, fontSize: 25, lineHeight: 29, fontWeight: '700' },
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
  dangerVault: { gap: spacing.md, padding: spacing.lg, borderRadius: cinematic.radius.scene, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.danger, backgroundColor: colors.surfaceDanger },
  dangerHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  dangerKicker: { color: colors.danger, fontFamily: typography.mono, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  dangerTitle: { marginTop: spacing.xs, color: colors.ink, fontFamily: typography.display, fontSize: 26, lineHeight: 31, fontWeight: '700' },
  dangerSignal: { width: 34, height: 3, borderRadius: radius.pill, backgroundColor: colors.danger },
  dangerBody: { color: colors.storyInk, fontSize: 12, lineHeight: 19 },
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
