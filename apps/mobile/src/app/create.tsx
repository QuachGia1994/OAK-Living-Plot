import { useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { PlotDraft, StoryMood } from '@/features/story/contracts';
import { StoryClientError } from '@/features/story/contracts';
import { hasDraftErrors, normalizePlotDraft, storyMoodOptions, validatePlotDraft } from '@/features/story/draft';
import { useMobileAuth } from '@/features/auth/mobile-auth-context';
import { createStoryRequestKey } from '@/features/story/request-key';
import { useStoryExperienceClient } from '@/features/story/story-client-context';
import { ActionButton, BrandMark, Card, Eyebrow, Screen } from '@/ui/primitives';
import { colors, radius, spacing } from '@/ui/theme';

const initialDraft: PlotDraft = {
  premise: '',
  mood: 'tense',
  characterName: '',
};

export default function CreatePlotScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ premise?: string | string[]; mood?: string | string[]; characterName?: string | string[] }>();
  const auth = useMobileAuth();
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
  const errors = validatePlotDraft(draft);

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
      setSubmitError(createErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }


  if (auth.configured && (!auth.isLoaded || !auth.isSignedIn)) {
    return (
      <Screen>
        <BrandMark />
        <Card>
          <Eyebrow>Canonical story identity</Eyebrow>
          <Text style={styles.title}>{auth.isLoaded ? 'Sign in before creating a live story.' : 'Loading secure session…'}</Text>
          <Text style={styles.subtitle}>Authenticated stories are owned by your internal Living Plot account and enforced by the backend.</Text>
        </Card>
        {auth.isLoaded ? <ActionButton label="Sign in with email code" onPress={() => router.replace('/auth')} /> : null}
        <ActionButton label="Cancel" variant="ghost" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.topBar}>
        <BrandMark />
        <ActionButton label="Cancel" variant="ghost" onPress={() => router.back()} />
      </View>

      <View style={styles.intro}>
        <Eyebrow>New plot · 3 decisions</Eyebrow>
        <Text style={styles.title}>Give the drama one spark.</Text>
        <Text style={styles.subtitle}>
          Premise, mood, one main character. Everything else can emerge from the story.
        </Text>
      </View>

      <Card>
        <FieldHeader step="01" label="What is happening?" hint="Required · 12–600 characters" />
        <TextInput
          accessibilityLabel="Story premise"
          multiline
          maxLength={600}
          placeholder="A junior chef learns the restaurant critic is the person who disappeared from her family ten years ago…"
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
      </Card>

      <Card>
        <FieldHeader step="02" label="Choose the mood" hint="One tap" />
        <View style={styles.moodGrid}>
          {storyMoodOptions.map((option) => (
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
      </Card>

      <Card>
        <FieldHeader step="03" label="Who are we following?" hint="One character is enough" />
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
      </Card>

      {submitError ? (
        <View style={styles.submitError}>
          <Text style={styles.submitErrorTitle}>Generation preview failed</Text>
          <Text style={styles.submitErrorBody}>{submitError}</Text>
        </View>
      ) : null}

      <View style={styles.submitBlock}>
        <ActionButton label="Generate episode 1" busy={busy} onPress={() => void submit()} />
        <Text style={styles.submitNote}>Text arrives first. Private voice stays optional after the episode is ready.</Text>
      </View>
    </Screen>
  );
}

function createErrorMessage(error: unknown): string {
  if (!(error instanceof StoryClientError)) return 'The first episode could not be prepared. Your setup is still here, so you can try again.';
  if (error.code === 'quota_exceeded') return 'Today’s text episode allowance is exhausted. Your setup is saved here until the UTC reset.';
  if (error.code === 'auth_required') return 'Your session expired. Sign in again before generating this plot.';
  if (error.code === 'provider_unavailable') return 'The story engine is temporarily unavailable. Your setup is unchanged; try again later.';
  if (error.code === 'choice_required') return 'This creation attempt no longer matches the server copy. Edit the setup or return home to resume the existing plot.';
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
    fontSize: 38,
    lineHeight: 42,
    fontWeight: '900',
    letterSpacing: -1,
  },
  subtitle: {
    color: colors.inkMuted,
    fontSize: 16,
    lineHeight: 24,
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
    color: colors.accent,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  fieldLabel: {
    flex: 1,
    color: colors.ink,
    fontSize: 20,
    fontWeight: '800',
  },
  hint: {
    color: colors.inkMuted,
    fontSize: 12,
  },
  textArea: {
    minHeight: 152,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    color: colors.ink,
    fontSize: 16,
    lineHeight: 24,
  },
  textInput: {
    minHeight: 54,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    color: colors.ink,
    fontSize: 17,
    fontWeight: '700',
  },
  inputError: {
    borderColor: colors.danger,
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
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
  },
  moodOptionSelected: {
    borderColor: colors.accent,
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
    fontSize: 16,
    fontWeight: '800',
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
