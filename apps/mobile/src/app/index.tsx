import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMobileAuth } from '@/features/auth/mobile-auth-context';
import type { StoryHomeSnapshot, StoryPlotSummary } from '@/features/story/contracts';
import { useStoryExperienceClient } from '@/features/story/story-client-context';
import { ActionButton, BrandMark, Card, ErrorState, Eyebrow, LoadingState, Pill, Screen } from '@/ui/primitives';
import { colors, radius, spacing } from '@/ui/theme';

export default function HomeScreen() {
  const router = useRouter();
  const auth = useMobileAuth();
  const storyExperienceClient = useStoryExperienceClient();
  const [snapshot, setSnapshot] = useState<StoryHomeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (auth.configured && (!auth.isLoaded || !auth.isSignedIn)) return;
    setError(null);
    try {
      setSnapshot(await storyExperienceClient.loadHome());
    } catch {
      setError('Recent stories could not be loaded. Your canonical story data is never replaced by this screen state.');
    }
  }, [auth.configured, auth.isLoaded, auth.isSignedIn, storyExperienceClient]);

  useEffect(() => {
    if (auth.configured && (!auth.isLoaded || !auth.isSignedIn)) return;
    let active = true;
    void storyExperienceClient
      .loadHome()
      .then((next) => {
        if (!active) return;
        setSnapshot(next);
        setError(null);
      })
      .catch(() => {
        if (!active) return;
        setError('Recent stories could not be loaded. Your canonical story data is never replaced by this screen state.');
      });
    return () => {
      active = false;
    };
  }, [auth.configured, auth.isLoaded, auth.isSignedIn, storyExperienceClient]);


  if (auth.configured && !auth.isLoaded) {
    return <Screen><BrandMark /><LoadingState label="Loading secure Living Plot session…" /></Screen>;
  }

  if (auth.configured && !auth.isSignedIn) {
    return (
      <Screen>
        <BrandMark />
        <View style={styles.hero}>
          <Eyebrow>Canonical story identity</Eyebrow>
          <Text style={styles.heroTitle}>Your choices should follow you, not this device.</Text>
          <Text style={styles.heroBody}>Sign in with one email code to create and resume server-owned Living Plot stories.</Text>
          <ActionButton label="Sign in or create account" onPress={() => router.push('/auth')} />
        </View>
        <Text style={styles.previewNote}>Local preview mode is used only when Clerk/API configuration is intentionally absent.</Text>
      </Screen>
    );
  }

  if (!snapshot && !error) {
    return (
      <Screen>
        <BrandMark />
        <LoadingState label="Opening Living Plot…" />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.topBar}>
        <BrandMark />
        {auth.configured && auth.isSignedIn ? <ActionButton label="Sign out" variant="ghost" onPress={() => void auth.signOut()} /> : null}
      </View>

      <View style={styles.hero}>
        <Eyebrow>Interactive mini-drama</Eyebrow>
        <Text style={styles.heroTitle}>A short story that remembers what you choose.</Text>
        <Text style={styles.heroBody}>
          Start with one situation. Every episode ends with three different actions, and the consequence carries forward.
        </Text>
        <ActionButton label="Start a new story" onPress={() => router.push('/create')} />
      </View>

      {error ? <ErrorState title="Couldn’t load your stories" message={error} onRetry={() => void load()} /> : null}

      {snapshot ? (
        <>
          <QuotaCard snapshot={snapshot} />
          <ActionButton label="See Living Plot Plus" variant="secondary" onPress={() => router.push('/plus')} />
          <View style={styles.sectionHeader}>
            <View>
              <Eyebrow>Continue</Eyebrow>
              <Text style={styles.sectionTitle}>Recent plots</Text>
            </View>
            <Text style={styles.sectionMeta}>{snapshot.recentPlots.length} active</Text>
          </View>

          <View style={styles.plotList}>
            {snapshot.recentPlots.map((plot) => (
              <RecentPlotCard
                key={plot.id}
                plot={plot}
                onPress={() => router.push({ pathname: '/story', params: { plotId: plot.id } })}
              />
            ))}
          </View>
        </>
      ) : null}

      <Text style={styles.previewNote}>
        {auth.configured ? 'Live mode: Clerk session → internal Living Plot user → canonical D1 story state.' : 'Preview mode: add Clerk and API public configuration to switch to canonical server stories.'}
      </Text>
    </Screen>
  );
}

function QuotaCard({ snapshot }: { snapshot: StoryHomeSnapshot }) {
  const { quota } = snapshot;
  return (
    <Card style={styles.quotaCard}>
      <View style={styles.quotaHeader}>
        <View>
          <Eyebrow>Server plan</Eyebrow>
          <Text style={styles.quotaTitle}>Today’s story budget</Text>
        </View>
        <Pill tone="accent">{quota.resetLabel}</Pill>
      </View>
      <View style={styles.quotaRows}>
        <QuotaMetric label="Text episodes" value={`${quota.textRemaining} / ${quota.textLimit} left`} />
        <QuotaMetric label="Fresh voice" value={`${quota.voiceRemaining} / ${quota.voiceLimit} left`} />
      </View>
      <Text style={styles.quotaFootnote}>Display only. The backend quota ledger remains authoritative.</Text>
    </Card>
  );
}

function QuotaMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.quotaMetric}>
      <Text style={styles.quotaMetricLabel}>{label}</Text>
      <Text style={styles.quotaMetricValue}>{value}</Text>
    </View>
  );
}

function RecentPlotCard({ plot, onPress }: { plot: StoryPlotSummary; onPress: () => void }) {
  const statusLabel = plot.status === 'awaiting_choice' ? 'Awaiting your choice' : 'Ready for next episode';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Resume ${plot.title}`}
      onPress={onPress}
      style={({ pressed }) => [styles.plotCard, pressed && styles.pressed]}
    >
      <View style={styles.plotTopRow}>
        <Pill tone={plot.status === 'awaiting_choice' ? 'accent' : 'success'}>{statusLabel}</Pill>
        <Text style={styles.plotEpisode}>EP {plot.episodeNumber}</Text>
      </View>
      <Text style={styles.plotTitle}>{plot.title}</Text>
      <Text style={styles.plotPremise} numberOfLines={2}>
        {plot.premise}
      </Text>
      <View style={styles.plotFooter}>
        <Text style={styles.plotMeta}>{plot.characterName} · {plot.mood}</Text>
        <Text style={styles.plotMeta}>{plot.updatedLabel}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hero: {
    gap: spacing.md,
    paddingTop: spacing.lg,
  },
  heroTitle: {
    color: colors.ink,
    fontSize: 39,
    lineHeight: 43,
    fontWeight: '900',
    letterSpacing: -1.2,
  },
  heroBody: {
    color: colors.inkMuted,
    fontSize: 17,
    lineHeight: 26,
    maxWidth: 560,
  },
  quotaCard: {
    backgroundColor: '#121116',
  },
  quotaHeader: {
    gap: spacing.md,
  },
  quotaTitle: {
    marginTop: spacing.xs,
    color: colors.ink,
    fontSize: 21,
    fontWeight: '800',
  },
  quotaRows: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quotaMetric: {
    flex: 1,
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
  },
  quotaMetricLabel: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  quotaMetricValue: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  quotaFootnote: {
    color: colors.inkMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionTitle: {
    marginTop: spacing.xs,
    color: colors.ink,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.7,
  },
  sectionMeta: {
    color: colors.inkMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  plotList: {
    gap: spacing.md,
  },
  plotCard: {
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.995 }],
  },
  plotTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  plotEpisode: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  plotTitle: {
    color: colors.ink,
    fontSize: 23,
    fontWeight: '900',
  },
  plotPremise: {
    color: colors.inkMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  plotFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  plotMeta: {
    color: colors.inkMuted,
    fontSize: 12,
    textTransform: 'capitalize',
  },
  previewNote: {
    color: '#777179',
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
});
