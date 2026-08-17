import { useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { PlotDraft, StoryMood } from '@/features/story/contracts';
import { StoryClientError } from '@/features/story/contracts';
import { hasDraftErrors, normalizePlotDraft, storyMoodOptionsFor, validatePlotDraft } from '@/features/story/draft';
import { useMobileAuth } from '@/features/auth/mobile-auth-context';
import { sharedUiCopy, useUiCopy } from '@/features/localization/ui-copy';
import { createStoryRequestKey } from '@/features/story/request-key';
import { useStoryExperienceClient } from '@/features/story/story-client-context';
import { ActionButton, BrandMark, Card, Eyebrow, Screen } from '@/ui/primitives';
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
        <Card>
          <Eyebrow>{t('Save your story', 'Lưu câu chuyện')}</Eyebrow>
          <Text style={styles.title}>{auth.isLoaded ? t('Sign in before starting a new plot.', 'Đăng nhập trước khi bắt đầu câu chuyện mới.') : t('Opening your account…', 'Đang mở tài khoản…')}</Text>
          <Text style={styles.subtitle}>{t('Your stories and choices will stay available when you return on another device.', 'Câu chuyện và lựa chọn của bạn vẫn còn khi quay lại trên thiết bị khác.')}</Text>
        </Card>
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
        <Eyebrow>{t('New plot · 3 quick choices', 'Cốt truyện mới · 3 lựa chọn nhanh')}</Eyebrow>
        <Text style={styles.title}>{t('Give the drama one spark.', 'Cho câu chuyện một tia lửa.')}</Text>
        <Text style={styles.subtitle}>
          {t('Tell us what is happening, pick the vibe, and name the main character. Episode 1 takes it from there.', 'Nói điều gì đang xảy ra, chọn không khí và đặt tên nhân vật chính. Tập 1 sẽ tiếp tục phần còn lại.')}
        </Text>
      </View>

      <View style={styles.setupSection}>
        <FieldHeader step="01" label={t('What is the situation?', 'Tình huống là gì?')} hint={t('One or two sentences is enough', 'Một hoặc hai câu là đủ')} />
        <TextInput
          accessibilityLabel="Story premise"
          multiline
          maxLength={600}
          placeholder={t('A junior chef learns the restaurant critic is the person who disappeared from her family ten years ago…', 'Một đầu bếp trẻ phát hiện vị khách phê bình nhà hàng chính là người đã biến mất khỏi gia đình cô mười năm trước…')}
          placeholderTextColor={colors.placeholder}
          style={[styles.textArea, showValidation && errors.premise && styles.inputError]}
          textAlignVertical="top"
          value={draft.premise}
          onChangeText={(premise) => setDraft((current) => ({ ...current, premise }))}
        />
        <View style={styles.fieldFooter}>
          <Text style={styles.errorText}>{showValidation ? errors.premise ?? '' : ''}</Text>
          <Text style={styles.counter}>{draft.premise.length}/600</Text>
        </View>
      </View>

      <View style={styles.setupSection}>
        <FieldHeader step="02" label={t('Pick the vibe', 'Chọn không khí')} hint={t('This shapes how the scene feels', 'Điều này định hình cảm xúc của cảnh')} />
        <View style={styles.moodGrid}>
          {moodOptions.map((option) => (
            <MoodOption
              key={option.value}
              selected={draft.mood === option.value}
              mood={option.value}
              label={option.label}
              description={option.description}
              onPress={() => setDraft((current) => ({ ...current, mood: option.value }))}
            />
          ))}
        </View>
      </View>

      <View style={styles.setupSection}>
        <FieldHeader step="03" label={t('Who is the main character?', 'Nhân vật chính là ai?')} hint={t('Just a name', 'Chỉ cần một cái tên')} />
        <TextInput
          accessibilityLabel="Main character name"
          autoCapitalize="words"
          maxLength={50}
          placeholder="Mina"
          placeholderTextColor={colors.placeholder}
          style={[styles.textInput, showValidation && errors.characterName && styles.inputError]}
          value={draft.characterName}
          onChangeText={(characterName) => setDraft((current) => ({ ...current, characterName }))}
          onSubmitEditing={() => void submit()}
        />
        {showValidation && errors.characterName ? <Text style={styles.errorText}>{errors.characterName}</Text> : null}
      </View>

      {submitError ? (
        <View style={styles.submitError}>
          <Text style={styles.submitErrorTitle}>{t('Episode 1 could not start', 'Không thể bắt đầu tập 1')}</Text>
          <Text style={styles.submitErrorBody}>{submitError}</Text>
        </View>
      ) : null}

      <View style={styles.submitBlock}>
        <ActionButton label={t('Start episode 1', 'Bắt đầu tập 1')} busy={busy} onPress={() => void submit()} />
        <Text style={styles.submitNote}>{t('Your first episode is short enough to finish in about a minute. Voice is optional.', 'Tập đầu đủ ngắn để xem trong khoảng một phút. Giọng đọc là tùy chọn.')}</Text>
      </View>
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

function MoodOption({
  selected,
  label,
  description,
  onPress,
}: {
  selected: boolean;
  mood: StoryMood;
  label: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.moodOption,
        selected && styles.moodOptionSelected,
        pressed && styles.moodPressed,
      ]}
    >
      <View style={[styles.moodDot, selected && styles.moodDotSelected]} />
      <Text style={[styles.moodLabel, selected && styles.moodLabelSelected]}>{label}</Text>
      <Text style={styles.moodDescription}>{description}</Text>
    </Pressable>
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
    fontSize: 42,
    lineHeight: 47,
    fontWeight: '700',
    letterSpacing: -1.2,
  },
  subtitle: {
    color: colors.inkMuted,
    fontSize: 16,
    lineHeight: 24,
  },
  setupSection: {
    gap: spacing.md,
    paddingVertical: spacing.lg,
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
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '700',
  },
  hint: {
    color: colors.inkMuted,
    fontSize: 12,
  },
  textArea: {
    minHeight: 160,
    paddingHorizontal: 0,
    paddingVertical: spacing.md,
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderStrong,
    borderRadius: 0,
    backgroundColor: 'transparent',
    color: colors.ink,
    fontFamily: typography.display,
    fontSize: 18,
    lineHeight: 28,
  },
  textInput: {
    minHeight: 54,
    paddingHorizontal: 0,
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderStrong,
    borderRadius: 0,
    backgroundColor: 'transparent',
    color: colors.ink,
    fontFamily: typography.display,
    fontSize: 20,
    fontWeight: '700',
  },
  inputError: {
    borderBottomColor: colors.danger,
  },
  fieldFooter: {
    minHeight: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  errorText: {
    flex: 1,
    color: colors.danger,
    fontSize: 12,
    lineHeight: 18,
  },
  counter: {
    color: colors.inkMuted,
    fontSize: 12,
  },
  moodGrid: {
    gap: spacing.sm,
  },
  moodOption: {
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
    borderRadius: 0,
    backgroundColor: 'transparent',
  },
  moodOptionSelected: {
    borderBottomColor: colors.accent,
    backgroundColor: colors.surfaceWarm,
  },
  moodPressed: {
    opacity: 0.78,
  },
  moodDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  moodDotSelected: {
    backgroundColor: colors.accent,
  },
  moodLabel: {
    color: colors.ink,
    fontFamily: typography.display,
    fontSize: 18,
    fontWeight: '700',
  },
  moodLabelSelected: {
    color: colors.accentStrong,
  },
  moodDescription: {
    color: colors.inkMuted,
    fontSize: 13,
    lineHeight: 19,
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
  },
  submitNote: {
    color: colors.inkMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
