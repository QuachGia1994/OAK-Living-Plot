import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import type { StoryLibrarySnapshot, StoryPlotSummary } from '@/features/story/contracts';
import { useStoryExperienceClient } from '@/features/story/story-client-context';
import { ActionButton, BrandMark, Card, ErrorState, Eyebrow, LoadingState, Pill, Screen } from '@/ui/primitives';
import { colors, spacing } from '@/ui/theme';

export default function StoryLibraryScreen() {
  const router = useRouter();
  const client = useStoryExperienceClient();
  const [snapshot, setSnapshot] = useState<StoryLibrarySnapshot | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSnapshot(await client.loadLibrary());
    } catch {
      setError('Your story library could not be loaded. Canonical plot state is unchanged.');
    }
  }, [client]);

  useEffect(() => {
    let active = true;
    void client.loadLibrary()
      .then((next) => {
        if (!active) return;
        setSnapshot(next);
        setError(null);
      })
      .catch(() => {
        if (active) setError('Your story library could not be loaded. Canonical plot state is unchanged.');
      });
    return () => { active = false; };
  }, [client]);

  async function change(plot: StoryPlotSummary, action: 'archive' | 'restore') {
    setBusyId(plot.id);
    setError(null);
    try {
      if (action === 'archive') await client.archivePlot(plot.id);
      else await client.restorePlot(plot.id);
      await load();
    } catch {
      setError(`This plot could not be ${action === 'archive' ? 'archived' : 'restored'}.`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Screen>
      <View style={styles.topBar}>
        <BrandMark />
        <ActionButton label="Home" variant="ghost" onPress={() => router.replace('/')} />
      </View>
      <View style={styles.hero}>
        <Eyebrow>My stories</Eyebrow>
        <Text style={styles.title}>Every plot you’ve started.</Text>
        <Text style={styles.body}>Keep current dramas active, or pause older ones and bring them back whenever you want.</Text>
      </View>

      {error ? <ErrorState title="My Stories could not update" message={error} onRetry={() => void load()} /> : null}
      {!snapshot && !error ? <LoadingState label="Opening My Stories…" /> : null}

      {snapshot ? (
        <>
          <LibrarySection
            title="Active"
            plots={snapshot.active}
            empty="No active plots yet."
            action="archive"
            busyId={busyId}
            onOpen={(plot) => router.push({ pathname: '/story', params: { plotId: plot.id } })}
            onChange={change}
          />
          <LibrarySection
            title="Paused"
            plots={snapshot.archived}
            empty="No paused stories."
            action="restore"
            busyId={busyId}
            onOpen={(plot) => router.push({ pathname: '/story', params: { plotId: plot.id, readOnly: '1' } })}
            onChange={change}
          />
        </>
      ) : null}
    </Screen>
  );
}

function LibrarySection({
  title,
  plots,
  empty,
  action,
  busyId,
  onOpen,
  onChange,
}: {
  title: string;
  plots: StoryPlotSummary[];
  empty: string;
  action: 'archive' | 'restore';
  busyId: string | null;
  onOpen: (plot: StoryPlotSummary) => void;
  onChange: (plot: StoryPlotSummary, action: 'archive' | 'restore') => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Pill>{plots.length}</Pill>
      </View>
      {plots.length === 0 ? <Card><Text style={styles.body}>{empty}</Text></Card> : null}
      {plots.map((plot) => (
        <Card key={plot.id}>
          <View style={styles.plotHeader}>
            <Pill tone={plot.status === 'awaiting_choice' ? 'accent' : 'success'}>EP {plot.episodeNumber}</Pill>
            <Text style={styles.meta}>{plot.updatedLabel}</Text>
          </View>
          <Text style={styles.plotTitle}>{plot.title}</Text>
          <Text style={styles.body} numberOfLines={2}>{plot.resumeLine}</Text>
          <View style={styles.actions}>
            <View style={styles.actionGrow}><ActionButton label={action === 'archive' ? 'Continue' : 'Read latest'} variant="secondary" onPress={() => onOpen(plot)} /></View>
            <View style={styles.actionGrow}>
              <ActionButton
                label={action === 'archive' ? 'Pause' : 'Restore'}
                variant="ghost"
                busy={busyId === plot.id}
                disabled={busyId !== null && busyId !== plot.id}
                onPress={() => onChange(plot, action)}
              />
            </View>
          </View>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hero: { gap: spacing.sm },
  title: { color: colors.ink, fontSize: 32, lineHeight: 38, fontWeight: '900' },
  body: { color: colors.inkMuted, fontSize: 14, lineHeight: 21 },
  section: { gap: spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: colors.ink, fontSize: 24, fontWeight: '900' },
  plotHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  plotTitle: { color: colors.ink, fontSize: 20, lineHeight: 26, fontWeight: '900' },
  meta: { color: colors.inkMuted, fontSize: 12 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  actionGrow: { flex: 1 },
});
