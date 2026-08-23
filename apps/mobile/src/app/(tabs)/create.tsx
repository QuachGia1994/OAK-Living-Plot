import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { GenerationJob } from '@/features/drama/domain';
import type { DramaDraft, DramaMood } from '@/features/drama/contracts';
import { DramaClientError } from '@/features/drama/contracts';
import { dramaDraftValidationSummary, dramaMoodOptionsFor, hasDraftErrors, normalizeDramaDraft, validateDramaDraft } from '@/features/drama/setup';
import { useMobileAuth } from '@/features/auth/mobile-auth-context';
import { useUiCopy } from '@/features/localization/ui-copy';
import { createIdempotencyKey } from '@/lib/idempotency-key';
import { useDramaExperienceClient } from '@/features/drama/drama-client-context';
import { DramaComposerPreview, DramaGenerationState, DramaUtilityHero } from '@/ui/drama-visuals';
import { conceptFlowStep } from '@/ui/concept-flow';
import { ActionButton, BrandMark, ConceptStageHeader, Screen, TaskActionDock } from '@/ui/primitives';
import { cinematic, classical, colors, radius, spacing, typography } from '@/ui/theme';

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
  const worldStep = conceptFlowStep(locale, 'world');
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

  const generating = generationJob.state === 'running';
  const footer = (
    <TaskActionDock
      eyebrow={t('Scene 1 setup', 'Thiết lập cảnh 1')}
      title={draft.characterName.trim() || t('Name your lead', 'Đặt tên nhân vật chính')}
      detail={submitError
        ? t('Your setup is preserved for a safe retry.', 'Thiết lập vẫn được giữ để thử lại an toàn.')
        : t('One canonical Scene with three choices.', 'Một Cảnh chuẩn với ba lựa chọn.')}
    >
      <ActionButton
        label={generationJob.state === 'failed' ? t('Retry scene 1', 'Thử lại cảnh 1') : t('Begin the story', 'Bắt đầu câu chuyện')}
        busy={generating}
        disabled={generating}
        onPress={() => void submit()}
      />
    </TaskActionDock>
  );

  return (
    <Screen contentStyle={styles.screenContent} footer={footer}>
      <BrandMark />

      <ConceptStageHeader
        number={worldStep.number}
        kicker={worldStep.kicker}
        title={t('Build the world', 'Tạo thế giới')}
        description={t('Give Living Plot one dramatic spark, one mood and one lead.', 'Trao cho Living Plot một mầm drama, một không khí và một nhân vật chính.')}
        meta={t('Scene 1 begins from this setup', 'Cảnh 1 bắt đầu từ thiết lập này')}
      />

      <DramaComposerPreview
        premise={draft.premise}
        characterName={draft.characterName}
        mood={draft.mood}
        label={t('LIVE SCENE PREVIEW', 'XEM TRƯỚC CẢNH')}
        locale={locale}
        compact
      />

      <View style={styles.worldForm}>
        <FieldLabel label={t('Drama spark', 'Mầm drama')} hint={t('The moment everything changes', 'Khoảnh khắc mọi thứ thay đổi')} />
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

        <FieldLabel label={t('Dramatic mood', 'Không khí drama')} hint={t('Choose the pressure surrounding Scene 1', 'Chọn áp lực bao quanh Cảnh 1')} />
        <View style={styles.moodGrid}>
          {moodOptions.map((option) => (
            <MoodChip
              key={option.value}
              mood={option.value}
              label={option.label}
              description={option.description}
              selected={draft.mood === option.value}
              onPress={() => setDraft((current) => ({ ...current, mood: option.value }))}
            />
          ))}
        </View>

        <FieldLabel label={t('Lead character', 'Nhân vật chính')} hint={t('Name the person at the center', 'Đặt tên người ở trung tâm')} />
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
      ) : null}
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
  if (error.code === 'backend_unavailable') {
    if (error.message.includes('too long')) {
      return vi
        ? 'Bộ máy tạo cảnh phản hồi quá chậm. Thiết lập và khóa tạo vẫn được giữ an toàn; hãy thử lại để tiếp tục cùng yêu cầu.'
        : 'Scene generation took too long to respond. Your setup and generation key are preserved safely; retry to continue the same request.';
    }
    return vi ? 'Dịch vụ Living Plot không hoàn tất được yêu cầu. Thiết lập vẫn được giữ để bạn thử lại.' : 'Living Plot could not complete the request. Your setup is still here so you can retry.';
  }
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

function FieldLabel({ label, hint }: { label: string; hint: string }) {
  return (
    <View style={styles.fieldHeader}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.hint}>{hint}</Text>
    </View>
  );
}

function MoodChip({
  mood,
  label,
  description,
  selected,
  onPress,
}: {
  mood: DramaMood;
  label: string;
  description: string;
  selected: boolean;
  onPress: () => void;
}) {
  const tone = cinematic.scene[mood];
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`${label}. ${description}`}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.moodChip,
        selected && { borderColor: tone.rim, backgroundColor: tone.base },
        pressed && styles.moodChipPressed,
      ]}
    >
      <View style={[styles.moodSignal, { backgroundColor: tone.rim }]} />
      <View style={styles.moodCopy}>
        <Text style={[styles.moodLabel, selected && { color: tone.rim }]}>{label}</Text>
        <Text style={styles.moodDescription} numberOfLines={1}>{description}</Text>
      </View>
      <Text style={[styles.moodState, selected && styles.moodStateSelected]}>{selected ? '●' : '○'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screenContent: { gap: spacing.md },
  worldForm: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: classical.goldDeep,
    backgroundColor: colors.surfaceGlass,
  },
  fieldHeader: { gap: 2, paddingTop: spacing.xs },
  fieldLabel: {
    color: colors.ink,
    fontFamily: typography.display,
    fontSize: 18,
    lineHeight: 22,
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
    borderWidth: 1,
    borderColor: classical.goldDeep,
    backgroundColor: colors.surfaceGlass,
  },
  composerError: {
    borderColor: colors.danger,
  },
  sparkInput: {
    minHeight: 104,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    color: colors.ink,
    fontFamily: typography.display,
    fontSize: 17,
    lineHeight: 24,
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
    gap: spacing.xs,
  },
  moodChip: {
    minWidth: 142,
    minHeight: 58,
    flex: 1,
    flexBasis: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceQuiet,
  },
  moodChipPressed: { opacity: 0.76 },
  moodSignal: { width: 3, height: 28, borderRadius: radius.pill },
  moodCopy: { minWidth: 0, flex: 1, gap: 2 },
  moodLabel: { color: colors.ink, fontSize: 13, lineHeight: 17, fontWeight: '800' },
  moodDescription: { color: colors.quietInk, fontSize: 9, lineHeight: 13 },
  moodState: { color: colors.quietInk, fontSize: 12 },
  moodStateSelected: { color: colors.accentStrong },
  castInputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: classical.goldDeep,
    backgroundColor: colors.surfaceGlass,
  },
  castInputError: {
    borderColor: colors.danger,
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
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.danger,
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
});
