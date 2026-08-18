import { useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { PlotDraft, StoryMood } from '@/features/story/contracts';
import { StoryClientError } from '@/features/story/contracts';
import { hasDraftErrors, normalizePlotDraft, storyMoodOptionsFor, validatePlotDraft } from '@/features/story/draft';
import { useMobileAuth } from '@/features/auth/mobile-auth-context';
import { sharedUiCopy, useUiCopy } from '@/features/localization/ui-copy';
import { createStoryRequestKey } from '@/features/story/request-key';
import { useStoryExperienceClient } from '@/features/story/story-client-context';
import { DramaNavigationDock } from '@/ui/drama-navigation';
import { DramaCastingPreview, DramaComposerPreview, DramaGenerationState, DramaMoodSwatch, DramaUtilityHero } from '@/ui/drama-visuals';
import { ActionButton, BrandMark, Eyebrow, Screen } from '@/ui/primitives';
import { colors, radius, spacing, typography } from '@/ui/theme';

const initialDraft: PlotDraft = {
  premise: '',
  mood: 'tense',
  characterName: '',
};

export default function CreatePlotScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ premise?: string | string[]; mood?: string | string[]; characterName?: string | string[] }>();
  const auth = useMobileAuth();
  const { locale, t } = useUiCopy();
  const storyExperienceClient = useStoryExperienceClient();
  const creationAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const [draft, setDraft] = useState<PlotDraft>(() => ({
    premise: readParam(params.premise) ?? initialDraft.premise,
    mood: readMood(params.mood) ?? initialDraft.mood,
    characterName: readParam(params.characterName) ?? initialDraft.characterName,
  }));
  const [showValidation, setShowValidation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const errors = validatePlotDraft(draft, locale);
  const moodOptions = storyMoodOptionsFor(locale);

  async function submit() {
    setShowValidation(true);
    setSubmitError(null);
    if (hasDraftErrors(errors)) return;

    setBusy(true);
    const normalizedDraft = normalizePlotDraft(draft);
    const fingerprint = JSON.stringify(normalizedDraft);
    const previousAttempt = creationAttempt.current;
    const attempt = previousAttempt?.fingerprint === fingerprint
      ? previousAttempt
      : { fingerprint, key: createStoryRequestKey('creation') };
    creationAttempt.current = attempt;
    try {
      const plot = await storyExperienceClient.createPlot(normalizedDraft, attempt.key);
      router.replace({ pathname: '/story', params: { plotId: plot.id } });
    } catch (caught) {
      setSubmitError(createErrorMessage(caught, locale));
    } finally {
      setBusy(false);
    }
  }

  if (auth.configured && (!auth.isLoaded || !auth.isSignedIn)) {
    return (
      <Screen>
        <BrandMark />
        <DramaUtilityHero
          kicker={t('SAVE YOUR PLOT', 'LƯU CỐT TRUYỆN')}
          title={auth.isLoaded ? t('Sign in before directing a new drama.', 'Đăng nhập trước khi dựng drama mới.') : t('Opening your account…', 'Đang mở tài khoản…')}
          detail={t('Your choices stay linked when you return on another device.', 'Lựa chọn vẫn được liên kết khi bạn quay lại trên thiết bị khác.')}
          mood="mysterious"
          characterName="Create"
        />
        {auth.isLoaded ? <ActionButton label={t('Sign in with email code', 'Đăng nhập bằng mã email')} onPress={() => router.replace('/auth')} /> : null}
        <ActionButton label={sharedUiCopy.cancel[locale]} variant="ghost" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.topBar}>
        <BrandMark />
        <ActionButton label={sharedUiCopy.cancel[locale]} variant="ghost" onPress={() => router.back()} />
      </View>

      <View style={styles.intro}>
        <Eyebrow>{t('Direct a new mini-drama', 'Dựng một mini-drama mới')}</Eyebrow>
        <Text style={styles.title}>{t('Frame the first scene.', 'Dựng cảnh đầu tiên.')}</Text>
        <Text style={styles.subtitle}>{t('One spark. One lead. One mood.', 'Một tia lửa. Một nhân vật. Một không khí.')}</Text>
      </View>

      <DramaNavigationDock
        active="create"
        locale={locale}
        onNavigate={(destination) => {
          if (destination === 'create') return;
          router.replace(destination === 'home' ? '/' : destination === 'library' ? '/library' : '/settings');
        }}
      />

      <DramaComposerPreview
        premise={draft.premise}
        characterName={draft.characterName}
        mood={draft.mood}
        label={t('LIVE SCENE PREVIEW', 'XEM TRƯỚC CẢNH')}
        locale={locale}
      />

      <View style={styles.composerSection}>
        <FieldHeader step="01" label={t('Story spark', 'Tia lửa câu chuyện')} hint={t('The moment everything changes', 'Khoảnh khắc mọi thứ thay đổi')} />
        <View style={[styles.sparkComposer, showValidation && errors.premise && styles.composerError]}>
          <TextInput
            accessibilityLabel={t('Story premise', 'Tình huống câu chuyện')}
            multiline
            maxLength={600}
            placeholder={t('A junior chef realizes tonight’s critic is the person who vanished from her family ten years ago…', 'Một đầu bếp trẻ nhận ra vị khách phê bình tối nay chính là người đã biến mất khỏi gia đình cô mười năm trước…')}
            placeholderTextColor={colors.placeholder}
            style={styles.sparkInput}
            textAlignVertical="top"
            value={draft.premise}
            onChangeText={(premise) => setDraft((current) => ({ ...current, premise }))}
          />
          <View style={styles.fieldFooter}>
            <Text style={styles.errorText}>{showValidation ? errors.premise ?? '' : ''}</Text>
            <Text style={styles.counter}>{draft.premise.length}/600</Text>
          </View>
        </View>
      </View>

      <View style={styles.composerSection}>
        <FieldHeader step="02" label={t('Light the scene', 'Chọn ánh sáng cảnh')} hint={t('Choose the dramatic pressure', 'Chọn áp lực kịch tính')} />
        <View style={styles.moodGrid}>
          {moodOptions.map((option) => (
            <DramaMoodSwatch
              key={option.value}
              mood={option.value}
              label={option.label}
              description={option.description}
              selected={draft.mood === option.value}
              locale={locale}
              onPress={() => setDraft((current) => ({ ...current, mood: option.value }))}
            />
          ))}
        </View>
      </View>

      <View style={styles.composerSection}>
        <FieldHeader step="03" label={t('Cast the lead', 'Chọn nhân vật chính')} hint={t('Name the person at the center', 'Đặt tên người ở trung tâm')} />
        <DramaCastingPreview
          characterName={draft.characterName}
          mood={draft.mood}
          premise={draft.premise}
          label={t('LEAD CAST', 'NHÂN VẬT CHÍNH')}
          locale={locale}
        />
        <View style={[styles.castInputShell, showValidation && errors.characterName && styles.castInputError]}>
          <Text style={styles.castInputLabel}>{t('NAME', 'TÊN')}</Text>
          <TextInput
            accessibilityLabel={t('Main character name', 'Tên nhân vật chính')}
            autoCapitalize="words"
            maxLength={50}
            placeholder="Mina"
            placeholderTextColor={colors.placeholder}
            style={styles.castInput}
            value={draft.characterName}
            onChangeText={(characterName) => setDraft((current) => ({ ...current, characterName }))}
            onSubmitEditing={() => void submit()}
          />
        </View>
        {showValidation && errors.characterName ? <Text style={styles.errorText}>{errors.characterName}</Text> : null}
      </View>

      {submitError ? (
        <View style={styles.submitError}>
          <Text style={styles.submitErrorTitle}>{t('Episode 1 could not start', 'Không thể bắt đầu tập 1')}</Text>
          <Text style={styles.submitErrorBody}>{submitError}</Text>
        </View>
      ) : null}

      {busy ? (
        <DramaGenerationState
          characterName={draft.characterName || t('Your lead', 'Nhân vật chính')}
          mood={draft.mood}
          label={t('Directing episode 1…', 'Đang dựng tập 1…')}
          detail={t('Turning your spark into a short scene, framing the lead and preparing the first decision point.', 'Đang biến tia lửa thành một cảnh ngắn, dựng nhân vật chính và chuẩn bị điểm quyết định đầu tiên.')}
          locale={locale}
        />
      ) : (
        <View style={styles.submitBlock}>
          <ActionButton label={t('Play episode 1', 'Xem tập 1')} onPress={() => void submit()} />
        </View>
      )}
    </Screen>
  );
}

function createErrorMessage(error: unknown, locale: 'en' | 'vi'): string {
  const vi = locale === 'vi';
  if (!(error instanceof StoryClientError)) return vi ? 'Không thể chuẩn bị tập đầu. Thiết lập vẫn còn để bạn thử lại.' : 'The first episode could not be prepared. Your setup is still here, so you can try again.';
  if (error.code === 'quota_exceeded') return vi ? 'Bạn đã dùng hết lượt tập chữ hôm nay. Thiết lập vẫn được giữ đến khi hạn mức UTC đặt lại.' : 'Today’s text episode allowance is exhausted. Your setup is saved here until the UTC reset.';
  if (error.code === 'auth_required') return vi ? 'Phiên đăng nhập đã hết hạn. Đăng nhập lại trước khi tạo câu chuyện.' : 'Your session expired. Sign in again before generating this plot.';
  if (error.code === 'provider_unavailable') return vi ? 'Bộ máy tạo truyện tạm thời không khả dụng. Thiết lập không thay đổi; hãy thử lại sau.' : 'The story engine is temporarily unavailable. Your setup is unchanged; try again later.';
  if (error.code === 'choice_required') return vi ? 'Lần tạo này không còn khớp với bản trên máy chủ. Chỉnh thiết lập hoặc về trang chủ để tiếp tục câu chuyện hiện có.' : 'This creation attempt no longer matches the server copy. Edit the setup or return home to resume the existing plot.';
  return error.message;
}

function readParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return value?.trim() || null;
}

function readMood(value: string | string[] | undefined): StoryMood | null {
  const candidate = readParam(value);
  return candidate === 'tense' || candidate === 'romantic' || candidate === 'mysterious' || candidate === 'hopeful' ? candidate : null;
}

function FieldHeader({ step, label, hint }: { step: string; label: string; hint: string }) {
  return (
    <View style={styles.fieldHeader}>
      <View style={styles.fieldHeadingRow}>
        <Text style={styles.step}>{step}</Text>
        <Text style={styles.fieldLabel}>{label}</Text>
      </View>
      <Text style={styles.hint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  intro: {
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  title: {
    color: colors.ink,
    fontFamily: typography.display,
    fontSize: 36,
    lineHeight: 41,
    fontWeight: '700',
    letterSpacing: -1.2,
  },
  subtitle: {
    color: colors.inkMuted,
    fontSize: 15,
    lineHeight: 23,
    maxWidth: 560,
  },
  composerSection: {
    gap: spacing.md,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
  },
  fieldHeader: {
    gap: spacing.sm,
  },
  fieldHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  step: {
    color: colors.accentStrong,
    fontFamily: typography.mono,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  fieldLabel: {
    flex: 1,
    color: colors.ink,
    fontFamily: typography.display,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '700',
  },
  hint: {
    color: colors.inkMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  sparkComposer: {
    overflow: 'hidden',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceQuiet,
  },
  composerError: {
    borderColor: colors.danger,
  },
  sparkInput: {
    minHeight: 132,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    color: colors.ink,
    fontFamily: typography.display,
    fontSize: 19,
    lineHeight: 28,
  },
  fieldFooter: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  errorText: {
    flex: 1,
    color: colors.danger,
    fontSize: 12,
    lineHeight: 18,
  },
  counter: {
    color: colors.inkMuted,
    fontFamily: typography.mono,
    fontSize: 10,
  },
  moodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  castInputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderStrong,
  },
  castInputError: {
    borderBottomColor: colors.danger,
  },
  castInputLabel: {
    color: colors.accentStrong,
    fontFamily: typography.mono,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  castInput: {
    minHeight: 58,
    flex: 1,
    color: colors.ink,
    fontFamily: typography.display,
    fontSize: 22,
    fontWeight: '700',
  },
  submitError: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceDanger,
  },
  submitErrorTitle: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '800',
  },
  submitErrorBody: {
    color: colors.inkMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  submitBlock: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
});
