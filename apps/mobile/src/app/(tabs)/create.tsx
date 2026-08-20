import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { GenerationJob } from '@/features/drama/domain';
import type { DramaDraft, DramaMood } from '@/features/drama/contracts';
import { DramaClientError } from '@/features/drama/contracts';
import { dramaDraftValidationSummary, dramaMoodOptionsFor, hasDraftErrors, normalizeDramaDraft, validateDramaDraft } from '@/features/drama/setup';
import { useMobileAuth } from '@/features/auth/mobile-auth-context';
import { useUiCopy } from '@/features/localization/ui-copy';
import { createIdempotencyKey } from '@/lib/idempotency-key';
import { useDramaExperienceClient } from '@/features/drama/drama-client-context';
import { DramaCastingPreview, DramaComposerPreview, DramaGenerationState, DramaMoodSwatch, DramaUtilityHero } from '@/ui/drama-visuals';
import { ActionButton, BrandMark, Eyebrow, Screen } from '@/ui/primitives';
import { colors, radius, spacing, typography } from '@/ui/theme';

const initialDraft: DramaDraft = {
  premise: '',
  mood: 'tense',
  characterName: '',
};

export default function CreateDramaScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ premise?: string | string[]; mood?: string | string[]; characterName?: string | string[]; launchKey?: string | string[] }>();
  const auth = useMobileAuth();
  const { locale, t } = useUiCopy();
  const dramaExperienceClient = useDramaExperienceClient();
  const creationAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const submitting = useRef(false);
  const initialLaunchKey = readParam(params.launchKey);
  const appliedLaunchKey = useRef(initialLaunchKey);
  const [draft, setDraft] = useState<DramaDraft>(() => ({
    premise: readParam(params.premise) ?? initialDraft.premise,
    mood: readMood(params.mood) ?? initialDraft.mood,
    characterName: readParam(params.characterName) ?? initialDraft.characterName,
  }));
  const [showValidation, setShowValidation] = useState(false);
  const [generationJob, setGenerationJob] = useState<GenerationJob>({ state: 'idle' });
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const launchKey = readParam(params.launchKey);
    if (!launchKey || launchKey === appliedLaunchKey.current) return;
    appliedLaunchKey.current = launchKey;
    creationAttempt.current = null;
    setDraft({
      premise: readParam(params.premise) ?? initialDraft.premise,
      mood: readMood(params.mood) ?? initialDraft.mood,
      characterName: readParam(params.characterName) ?? initialDraft.characterName,
    });
    setShowValidation(false);
    setGenerationJob({ state: 'idle' });
    setSubmitError(null);
  }, [params.characterName, params.launchKey, params.mood, params.premise]);

  const errors = validateDramaDraft(draft, locale);
  const moodOptions = dramaMoodOptionsFor(locale);

  async function submit() {
    if (submitting.current) return;
    const currentErrors = validateDramaDraft(draft, locale);
    setShowValidation(true);
    setSubmitError(null);
    if (hasDraftErrors(currentErrors)) {
      setSubmitError(dramaDraftValidationSummary(currentErrors, locale));
      return;
    }

    const normalizedDraft = normalizeDramaDraft(draft);
    const fingerprint = JSON.stringify(normalizedDraft);
    const previousAttempt = creationAttempt.current;
    const attempt = previousAttempt?.fingerprint === fingerprint
      ? previousAttempt
      : { fingerprint, key: createIdempotencyKey('creation') };
    creationAttempt.current = attempt;
    submitting.current = true;
    setGenerationJob({ state: 'running', operation: 'first_scene', requestKey: attempt.key });
    try {
      const drama = await dramaExperienceClient.createDrama(normalizedDraft, attempt.key);
      router.replace({ pathname: '/library/drama', params: { dramaId: drama.id } });
    } catch (caught) {
      setSubmitError(createErrorMessage(caught, locale));
      setGenerationJob({ state: 'failed', operation: 'first_scene', code: generationFailureCode(caught) });
    } finally {
      submitting.current = false;
    }
  }

  if (auth.configured && (!auth.isLoaded || !auth.isSignedIn)) {
    return (
      <Screen>
        <BrandMark />
        <DramaUtilityHero
          kicker={t('SAVE YOUR DRAMA', 'LƯU DRAMA')}
          title={auth.isLoaded ? t('Sign in before directing a new drama.', 'Đăng nhập trước khi dựng drama mới.') : t('Opening your account…', 'Đang mở tài khoản…')}
          detail={t('Your choices stay linked when you return on another device.', 'Lựa chọn vẫn được liên kết khi bạn quay lại trên thiết bị khác.')}
          mood="mysterious"
          characterName="Create"
        />
        {auth.isLoaded ? <ActionButton label={t('Sign in with email code', 'Đăng nhập bằng mã email')} onPress={() => router.replace('/auth')} /> : null}
      </Screen>
    );
  }

  return (
    <Screen>
      <BrandMark />

      <View style={styles.intro}>
        <Eyebrow>{t('Direct a new mini-drama', 'Dựng một mini-drama mới')}</Eyebrow>
        <Text style={styles.title}>{t('Frame the first scene.', 'Dựng cảnh đầu tiên.')}</Text>
        <Text style={styles.subtitle}>{t('One spark. One lead. One mood.', 'Một tia lửa. Một nhân vật. Một không khí.')}</Text>
      </View>

      <DramaComposerPreview
        premise={draft.premise}
        characterName={draft.characterName}
        mood={draft.mood}
        label={t('LIVE SCENE PREVIEW', 'XEM TRƯỚC CẢNH')}
        locale={locale}
      />

      <View style={styles.composerSection}>
        <FieldHeader step="01" label={t('Drama spark', 'Mầm drama')} hint={t('The moment everything changes', 'Khoảnh khắc mọi thứ thay đổi')} />
        <View style={[styles.sparkComposer, showValidation && errors.premise && styles.composerError]}>
          <TextInput
            accessibilityLabel={t('Drama premise', 'Tình huống drama')}
            multiline
            maxLength={600}
            placeholder={t('Example: A junior chef realizes tonight’s critic is the person who vanished from her family ten years ago…', 'Ví dụ: Một đầu bếp trẻ nhận ra vị khách phê bình tối nay chính là người đã biến mất khỏi gia đình cô mười năm trước…')}
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
            placeholder={t('Example: Mina', 'Ví dụ: Mina')}
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
        <View style={styles.submitError} accessibilityLiveRegion="assertive">
          <Text style={styles.submitErrorTitle}>{t('Scene 1 could not start', 'Không thể bắt đầu cảnh 1')}</Text>
          <Text style={styles.submitErrorBody}>{submitError}</Text>
        </View>
      ) : null}

      {generationJob.state === 'running' ? (
        <DramaGenerationState
          characterName={draft.characterName || t('Your lead', 'Nhân vật chính')}
          mood={draft.mood}
          label={t('Generating scene 1…', 'Đang tạo cảnh 1…')}
          detail={t('Creating the canonical script and first branch. Voice remains a separate media step.', 'Đang tạo kịch bản chuẩn và nhánh đầu tiên. Giọng đọc là một bước media riêng.')}
          locale={locale}
        />
      ) : (
        <View style={styles.submitBlock}>
          <ActionButton label={generationJob.state === 'failed' ? t('Retry scene 1', 'Thử lại cảnh 1') : t('Create scene 1', 'Tạo cảnh 1')} onPress={() => void submit()} />
        </View>
      )}
    </Screen>
  );
}

function generationFailureCode(error: unknown): string {
  return error instanceof DramaClientError ? error.code : 'unknown';
}

function createErrorMessage(error: unknown, locale: 'en' | 'vi'): string {
  const vi = locale === 'vi';
  if (!(error instanceof DramaClientError)) return vi ? 'Không thể chuẩn bị cảnh đầu. Thiết lập vẫn còn để bạn thử lại.' : 'The first scene could not be prepared. Your setup is still here, so you can try again.';
  if (error.code === 'quota_exceeded') return vi ? 'Máy chủ đang giới hạn tạm thời việc tạo cảnh. Thiết lập vẫn được giữ để bạn thử lại.' : 'The server is temporarily limiting Scene generation. Your setup is still here so you can retry.';
  if (error.code === 'auth_required') return vi ? 'Phiên đăng nhập đã hết hạn. Đăng nhập lại trước khi tạo drama.' : 'Your session expired. Sign in again before generating this drama.';
  if (error.code === 'provider_unavailable') return vi ? 'Bộ máy tạo drama tạm thời không khả dụng. Thiết lập không thay đổi; hãy thử lại sau.' : 'The drama engine is temporarily unavailable. Your setup is unchanged; try again later.';
  if (error.code === 'choice_required') return vi ? 'Lần tạo này không còn khớp với bản trên máy chủ. Chỉnh thiết lập hoặc về trang chủ để tiếp tục drama hiện có.' : 'This creation attempt no longer matches the server copy. Edit the setup or return home to resume the existing drama.';
  if (error.code === 'backend_unavailable') return vi ? 'Không thể kết nối dịch vụ Living Plot. Thiết lập vẫn được giữ để bạn thử lại.' : 'Living Plot could not reach the server. Your setup is still here so you can retry.';
  if (error.code === 'invalid_generation') return vi ? 'Cảnh được tạo chưa đạt hợp đồng drama. Thiết lập vẫn được giữ để thử lại.' : 'The generated scene did not satisfy the drama contract. Your setup is still here so you can retry.';
  if (error.code === 'invalid_input') return vi ? 'Thiết lập cảnh chưa hợp lệ. Kiểm tra mầm drama và tên nhân vật rồi thử lại.' : 'The scene setup is invalid. Check the drama spark and lead name, then retry.';
  return error.message;
}

function readParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return value?.trim() || null;
}

function readMood(value: string | string[] | undefined): DramaMood | null {
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
  intro: {
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  title: {
    color: colors.ink,
    fontFamily: typography.display,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '700',
    letterSpacing: -0.5,
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
