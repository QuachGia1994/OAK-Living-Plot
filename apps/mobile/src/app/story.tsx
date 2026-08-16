import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StoryChoice, StoryPlotSession } from '@/features/story/contracts';
import { StoryClientError } from '@/features/story/contracts';
import { useMobileAuth } from '@/features/auth/mobile-auth-context';
import { useStoryExperienceClient } from '@/features/story/story-client-context';
import { ActionButton, BrandMark, Card, ErrorState, Eyebrow, LoadingState, Pill, Screen } from '@/ui/primitives';
import { colors, radius, spacing } from '@/ui/theme';

export default function StoryScreen() {
  const router = useRouter();
  const auth = useMobileAuth();
  const storyExperienceClient = useStoryExperienceClient();
  const params = useLocalSearchParams<{ plotId?: string | string[] }>();
  const plotId = useMemo(() => readParam(params.plotId), [params.plotId]);
  const [session, setSession] = useState<StoryPlotSession | null>(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<'commit' | 'next' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
  if (!plotId) {
      setError('This story link is missing its plot identifier.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setSession(await storyExperienceClient.loadPlot(plotId));
    } catch (caught) {
      setError(messageForError(caught, 'This story could not be resumed.'));
    } finally {
      setLoading(false);
    }
  }, [plotId, storyExperienceClient]);

  useEffect(() => {
    if (!plotId || (auth.configured && (!auth.isLoaded || !auth.isSignedIn))) return;
    let active = true;
    void storyExperienceClient
      .loadPlot(plotId)
      .then((next) => {
        if (!active) return;
        setSession(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(messageForError(caught, 'This story could not be resumed.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [auth.configured, auth.isLoaded, auth.isSignedIn, plotId, storyExperienceClient]);

  async function commitChoice() {
    if (!session || !selectedChoiceId) return;
    setBusyAction('commit');
    setError(null);
    try {
      const updated = await storyExperienceClient.commitChoice(
        session.id,
        session.episode.id,
        selectedChoiceId,
      );
      setSession(updated);
      setSelectedChoiceId(null);
    } catch (caught) {
      setError(messageForError(caught, 'The choice could not be committed. Try again without changing your selection.'));
    } finally {
      setBusyAction(null);
    }
  }

  async function requestNextEpisode() {
    if (!session) return;
    setBusyAction('next');
    setError(null);
    try {
      setSession(await storyExperienceClient.requestNextEpisode(session.id));
      setSelectedChoiceId(null);
    } catch (caught) {
      setError(messageForError(caught, 'The next episode could not be prepared. Your committed choice is still safe.'));
    } finally {
      setBusyAction(null);
    }
  }

  if (auth.configured && (!auth.isLoaded || !auth.isSignedIn)) {
    return (
      <Screen>
        <BrandMark />
        <ErrorState
          title={auth.isLoaded ? 'Sign in to resume this story' : 'Loading secure session…'}
          message="Canonical story memory is available only through your authenticated Living Plot account."
        />
        {auth.isLoaded ? <ActionButton label="Sign in with email code" onPress={() => router.replace('/auth')} /> : null}
        <ActionButton label="Back to home" variant="ghost" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  if (!plotId) {
    return (
      <Screen>
        <BrandMark />
        <ErrorState title="Story unavailable" message="This story link is missing its plot identifier." />
        <ActionButton label="Back to home" variant="ghost" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  if (loading) {
    return (
      <Screen>
        <BrandMark />
        <LoadingState label="Resuming the latest canonical episode…" />
      </Screen>
    );
  }

  if (!session) {
    return (
      <Screen>
        <BrandMark />
        <ErrorState title="Story unavailable" message={error ?? 'This story could not be loaded.'} onRetry={() => void load()} />
        <ActionButton label="Back to home" variant="ghost" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  const episode = session.episode;
  const selectedChoice = episode.choices.find((choice) => choice.id === selectedChoiceId);
  const awaitingChoice = episode.status === 'awaiting_choice';

  return (
    <Screen>
      <View style={styles.topBar}>
        <BrandMark />
        <ActionButton label="All plots" variant="ghost" onPress={() => router.replace('/')} />
      </View>

      <View style={styles.plotHeader}>
        <View style={styles.plotMetaRow}>
          <Pill tone={awaitingChoice ? 'accent' : 'success'}>
            {awaitingChoice ? 'Awaiting your choice' : 'Choice committed'}
          </Pill>
          <Text style={styles.episodeNumber}>EPISODE {episode.number}</Text>
        </View>
        <Text style={styles.plotTitle}>{session.title}</Text>
        <Text style={styles.plotMeta}>{session.characterName} · {session.mood}</Text>
      </View>

      <View style={styles.episodeBlock}>
        <Eyebrow>Episode {episode.number}</Eyebrow>
        <Text style={styles.episodeTitle}>{episode.title}</Text>
        <Text style={styles.episodeBody}>{episode.body}</Text>
      </View>

      {error ? (
        <ErrorState
          title="That action didn’t finish"
          message={error}
          onRetry={selectedChoiceId ? () => void commitChoice() : undefined}
        />
      ) : null}

      {awaitingChoice ? (
        <View style={styles.choiceSection}>
          <View style={styles.choiceHeading}>
            <View style={styles.choiceHeadingText}>
              <Eyebrow>The decision</Eyebrow>
              <Text style={styles.choiceTitle}>What does {session.characterName} do?</Text>
            </View>
            <Pill>Choose 1 of 3</Pill>
          </View>

          <View style={styles.choiceList}>
            {episode.choices.map((choice) => (
              <ChoiceCard
                key={choice.id}
                choice={choice}
                selected={choice.id === selectedChoiceId}
                disabled={busyAction !== null}
                onPress={() => setSelectedChoiceId(choice.id)}
              />
            ))}
          </View>

          <Card style={styles.commitCard}>
            {selectedChoice ? (
              <>
                <Text style={styles.commitLabel}>Selected path</Text>
                <Text style={styles.commitChoice}>{selectedChoice.label}</Text>
                <Text style={styles.commitIntent}>Intent: {selectedChoice.intent}</Text>
              </>
            ) : (
              <Text style={styles.commitEmpty}>Select one action above. Nothing changes until you commit it.</Text>
            )}
            <ActionButton
              label="Commit this choice"
              busy={busyAction === 'commit'}
              disabled={!selectedChoice}
              onPress={() => void commitChoice()}
            />
          </Card>
        </View>
      ) : (
        <View style={styles.consequenceSection}>
          <Card style={styles.consequenceCard}>
            <Eyebrow>Now canonical</Eyebrow>
            <Text style={styles.consequenceTitle}>Your choice changed the story.</Text>
            <Text style={styles.consequenceBody}>{episode.committedConsequence}</Text>
          </Card>
          <ActionButton
            label={`Generate episode ${episode.number + 1}`}
            busy={busyAction === 'next'}
            onPress={() => void requestNextEpisode()}
          />
          <Text style={styles.nextNote}>
            The next episode is built from the committed consequence, not from an untrusted local selection.
          </Text>
        </View>
      )}
    </Screen>
  );
}

function ChoiceCard({
  choice,
  selected,
  disabled,
  onPress,
}: {
  choice: StoryChoice;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Choice ${choice.key}: ${choice.label}`}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choiceCard,
        selected && styles.choiceCardSelected,
        pressed && !disabled && styles.choicePressed,
      ]}
    >
      <View style={[styles.choiceKey, selected && styles.choiceKeySelected]}>
        <Text style={[styles.choiceKeyText, selected && styles.choiceKeyTextSelected]}>{choice.key}</Text>
      </View>
      <View style={styles.choiceCopy}>
        <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>{choice.label}</Text>
        <Text style={styles.choiceIntent}>{choice.intent}</Text>
      </View>
    </Pressable>
  );
}

function readParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return value?.trim() || null;
}

function messageForError(error: unknown, fallback: string): string {
  if (!(error instanceof StoryClientError)) return fallback;
  if (error.code === 'choice_conflict') return 'A different choice is already canonical for this episode. Resume to see it.';
  if (error.code === 'choice_required') return 'Choose and commit one action before requesting the next episode.';
  if (error.code === 'not_found') return 'This plot or choice no longer matches the current story state.';
  if (error.code === 'auth_required') return 'Sign in again before continuing this canonical story.';
  if (error.code === 'quota_exceeded') return 'Today’s text episode allowance is exhausted. It resets at 00:00 UTC.';
  if (error.code === 'provider_unavailable') return 'Story generation is temporarily unavailable. Your canonical state is unchanged.';
  return fallback;
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  plotHeader: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  plotMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  episodeNumber: {
    color: colors.inkMuted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  plotTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '900',
  },
  plotMeta: {
    color: colors.inkMuted,
    fontSize: 12,
    textTransform: 'capitalize',
  },
  episodeBlock: {
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  episodeTitle: {
    color: colors.ink,
    fontSize: 36,
    lineHeight: 40,
    fontWeight: '900',
    letterSpacing: -0.9,
  },
  episodeBody: {
    color: '#DED8CE',
    fontSize: 18,
    lineHeight: 31,
  },
  choiceSection: {
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  choiceHeading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  choiceHeadingText: {
    flex: 1,
    gap: spacing.xs,
  },
  choiceTitle: {
    color: colors.ink,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '900',
  },
  choiceList: {
    gap: spacing.sm,
  },
  choiceCard: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  choiceCardSelected: {
    borderColor: colors.accent,
    backgroundColor: '#221C14',
  },
  choicePressed: {
    opacity: 0.78,
  },
  choiceKey: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
  },
  choiceKeySelected: {
    backgroundColor: colors.accent,
  },
  choiceKeyText: {
    color: colors.inkMuted,
    fontSize: 14,
    fontWeight: '900',
  },
  choiceKeyTextSelected: {
    color: colors.accentInk,
  },
  choiceCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  choiceLabel: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
  },
  choiceLabelSelected: {
    color: colors.accentStrong,
  },
  choiceIntent: {
    color: colors.inkMuted,
    fontSize: 12,
    textTransform: 'capitalize',
  },
  commitCard: {
    backgroundColor: '#111114',
  },
  commitLabel: {
    color: colors.inkMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  commitChoice: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  commitIntent: {
    color: colors.inkMuted,
    fontSize: 13,
    textTransform: 'capitalize',
  },
  commitEmpty: {
    color: colors.inkMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  consequenceSection: {
    gap: spacing.md,
  },
  consequenceCard: {
    borderColor: '#35513F',
    backgroundColor: '#101A14',
  },
  consequenceTitle: {
    color: colors.success,
    fontSize: 24,
    fontWeight: '900',
  },
  consequenceBody: {
    color: colors.ink,
    fontSize: 17,
    lineHeight: 26,
  },
  nextNote: {
    color: colors.inkMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
