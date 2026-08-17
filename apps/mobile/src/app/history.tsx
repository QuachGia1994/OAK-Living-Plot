import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import type { StoryHistorySnapshot } from '@/features/story/contracts';
import { useStoryExperienceClient } from '@/features/story/story-client-context';
import { ActionButton, BrandMark, Card, ErrorState, Eyebrow, LoadingState, Pill, Screen } from '@/ui/primitives';
import { colors, spacing } from '@/ui/theme';

export default function StoryHistoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ plotId?: string | string[] }>();
  const plotId = useMemo(() => readParam(params.plotId), [params.plotId]);
  const client = useStoryExperienceClient();
  const [history, setHistory] = useState<StoryHistorySnapshot | null>(null);
  const [error, setError] = useState<string | null>(plotId ? null : 'This history link is missing its plot identifier.');

  const load = useCallback(async () => {
    if (!plotId) {
      setError('This history link is missing its plot identifier.');
      return;
    }
    setError(null);
    try {
      setHistory(await client.loadHistory(plotId));
    } catch {
      setError('Canonical story history could not be loaded.');
    }
  }, [client, plotId]);

  useEffect(() => {
    if (!plotId) return;
    let active = true;
    void client.loadHistory(plotId)
      .then((next) => {
        if (!active) return;
        setHistory(next);
        setError(null);
      })
      .catch(() => {
        if (active) setError('Canonical story history could not be loaded.');
      });
    return () => { active = false; };
  }, [client, plotId]);

  return (
    <Screen>
      <View style={styles.topBar}>
        <BrandMark />
        <ActionButton
          label="Back to story"
          variant="ghost"
          onPress={() => plotId ? router.replace({ pathname: '/story', params: { plotId } }) : router.replace('/')}
        />
      </View>

      <View style={styles.hero}>
        <Eyebrow>Previously on Living Plot</Eyebrow>
        <Text style={styles.title}>{history?.title ?? 'Story so far'}</Text>
        <Text style={styles.body}>Every episode and choice you locked in is kept here, so you can remember how the drama got to this point.</Text>
      </View>

      {error ? <ErrorState title="Recap unavailable" message={error} onRetry={() => void load()} /> : null}
      {!history && !error ? <LoadingState label="Building your story recap…" /> : null}

      {history ? (
        <View style={styles.timeline}>
          {history.items.map((item) => (
            <Card key={item.episodeId}>
              <View style={styles.row}>
                <Pill tone={item.status === 'choice_committed' ? 'success' : 'accent'}>EP {item.episodeNumber}</Pill>
                <Text style={styles.status}>{item.status === 'choice_committed' ? 'Choice locked in' : 'Current episode'}</Text>
              </View>
              <Text style={styles.episodeTitle}>{item.title}</Text>
              <Text style={styles.body}>{item.summary}</Text>
              {item.choiceLabel ? (
                <View style={styles.choiceBlock}>
                  <Text style={styles.choiceLabel}>Choice {item.choiceKey}: {item.choiceLabel}</Text>
                  {item.consequence ? <Text style={styles.consequence}>{item.consequence}</Text> : null}
                </View>
              ) : (
                <Text style={styles.pending}>You have not locked in a choice for this episode yet.</Text>
              )}
            </Card>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

function readParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return value?.trim() || null;
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hero: { gap: spacing.sm },
  title: { color: colors.ink, fontSize: 32, lineHeight: 38, fontWeight: '900' },
  body: { color: colors.inkMuted, fontSize: 14, lineHeight: 22 },
  timeline: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  status: { color: colors.inkMuted, fontSize: 12, fontWeight: '700' },
  episodeTitle: { color: colors.ink, fontSize: 22, lineHeight: 28, fontWeight: '900' },
  choiceBlock: { gap: spacing.xs, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  choiceLabel: { color: colors.accentStrong, fontSize: 14, lineHeight: 20, fontWeight: '800' },
  consequence: { color: colors.storyInk, fontSize: 14, lineHeight: 21 },
  pending: { color: colors.inkMuted, fontSize: 12, lineHeight: 18, fontStyle: 'italic' },
});
