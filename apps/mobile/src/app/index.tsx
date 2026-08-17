import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMobileAuth } from '@/features/auth/mobile-auth-context';
import type { StoryHomeSnapshot, StoryPlotSummary } from '@/features/story/contracts';
import { useStoryExperienceClient } from '@/features/story/story-client-context';
import { useRefreshOnForeground } from '@/lib/use-refresh-on-foreground';
import { ActionButton, BrandMark, Card, ErrorState, Eyebrow, LoadingState, MotionReveal, Pill, Screen } from '@/ui/primitives';
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

  useRefreshOnForeground(load);

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
          <Eyebrow>Your stories, remembered</Eyebrow>
          <Text style={styles.heroTitle}>Pick what happens. Come back for the consequence.</Text>
          <Text style={styles.heroBody}>Sign in with one email code so your stories and choices stay with you across devices.</Text>
          <ActionButton label="Continue with email" onPress={() => router.push('/auth')} />
        </View>
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
        <Eyebrow>60–90 second interactive drama</Eyebrow>
        <Text style={styles.heroTitle}>Your choice writes the next scene.</Text>
        <Text style={styles.heroBody}>
          Create a situation, watch a short AI drama unfold, then choose one of three paths. The next episode remembers what you did.
        </Text>
        <ActionButton label="Create my first plot" onPress={() => router.push('/create')} />
        <ActionButton label="My stories" variant="secondary" onPress={() => router.push('/library')} />
      </View>

      <HowItWorks />

      {error ? <ErrorState title="Couldn’t load your stories" message={error} onRetry={() => void load()} /> : null}

      {snapshot ? (
        <>
          <MotionReveal><RetentionCard snapshot={snapshot} /></MotionReveal>
          <MotionReveal delay={70}>
            <DailySparkCard snapshot={snapshot} onStart={() => {
              const prompt = snapshot.retention.dailyPrompt;
              router.push({
                pathname: '/create',
                params: { premise: prompt.premise, mood: prompt.mood, characterName: prompt.characterName },
              });
            }} />
          </MotionReveal>
          <QuotaCard snapshot={snapshot} />
          <ActionButton label="Unlock more episodes" variant="secondary" onPress={() => router.push('/plus')} />
          <View style={styles.sectionHeader}>
            <View>
              <Eyebrow>Continue the drama</Eyebrow>
              <Text style={styles.sectionTitle}>Pick up where you left off</Text>
            </View>
            <Text style={styles.sectionMeta}>{snapshot.recentPlots.length} active</Text>
          </View>

          <View style={styles.plotList}>
            {snapshot.recentPlots.length === 0 ? (
              <Card>
                <Eyebrow>No active plots</Eyebrow>
                <Text style={styles.emptyTitle}>No stories yet.</Text>
                <Text style={styles.plotPremise}>Start with a situation, choose a mood and name the main character. Episode 1 does the rest.</Text>
              </Card>
            ) : snapshot.recentPlots.map((plot) => (
              <RecentPlotCard
                key={plot.id}
                plot={plot}
                onPress={() => router.push({ pathname: '/story', params: { plotId: plot.id } })}
              />
            ))}
          </View>
        </>
      ) : null}

      {!auth.configured ? <Text style={styles.previewNote}>Preview build · all core screens are available without signing in.</Text> : null}
    </Screen>
  );
}

function HowItWorks() {
  return (
    <Card style={styles.howCard}>
      <Eyebrow>How Living Plot works</Eyebrow>
      <View style={styles.howSteps}>
        <HowStep number="1" title="Set the spark" body="Give us the situation, mood and one main character." />
        <HowStep number="2" title="Watch the episode" body="AI turns it into a short, dramatic scene you can read or hear." />
        <HowStep number="3" title="Choose the consequence" body="Pick A, B or C. The next episode continues from that exact decision." />
      </View>
    </Card>
  );
}

function HowStep({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <View style={styles.howStep}>
      <View style={styles.howNumber}><Text style={styles.howNumberText}>{number}</Text></View>
      <View style={styles.howCopy}>
        <Text style={styles.howTitle}>{title}</Text>
        <Text style={styles.howBody}>{body}</Text>
      </View>
    </View>
  );
}

function RetentionCard({ snapshot }: { snapshot: StoryHomeSnapshot }) {
  const { retention } = snapshot;
  return (
    <Card style={styles.retentionCard}>
      <View style={styles.retentionHeader}>
        <View style={styles.retentionCopy}>
          <Eyebrow>Your momentum</Eyebrow>
          <Text style={styles.retentionTitle}>{retention.currentStreakDays > 0 ? `${retention.currentStreakDays}-day story streak` : 'One choice starts the streak'}</Text>
        </View>
        <Pill tone={retention.currentStreakDays > 0 ? 'success' : 'neutral'}>{retention.choicesMade} choices</Pill>
      </View>
      <Text style={styles.retentionBody}>{retention.activePlots} active {retention.activePlots === 1 ? 'story' : 'stories'} · {retention.choicesMade} decisions made.</Text>
    </Card>
  );
}

function DailySparkCard({ snapshot, onStart }: { snapshot: StoryHomeSnapshot; onStart: () => void }) {
  const prompt = snapshot.retention.dailyPrompt;
  return (
    <Card style={styles.sparkCard}>
      <View style={styles.sparkHeader}>
        <Eyebrow>Today’s spark</Eyebrow>
        <Pill tone="accent">{prompt.mood}</Pill>
      </View>
      <Text style={styles.sparkTitle}>{prompt.label}</Text>
      <Text style={styles.sparkBody}>{prompt.premise}</Text>
      <ActionButton label="Use this spark" variant="secondary" onPress={onStart} />
    </Card>
  );
}

function QuotaCard({ snapshot }: { snapshot: StoryHomeSnapshot }) {
  const { quota } = snapshot;
  return (
    <Card style={styles.quotaCard}>
      <View style={styles.quotaHeader}>
        <View>
          <Eyebrow>Today</Eyebrow>
          <Text style={styles.quotaTitle}>Your episode allowance</Text>
        </View>
        <Pill tone="accent">{quota.resetLabel}</Pill>
      </View>
      <View style={styles.quotaRows}>
        <QuotaMetric label="Text episodes" value={`${quota.textRemaining} / ${quota.textLimit} left`} />
        <QuotaMetric label="Fresh voice" value={`${quota.voiceRemaining} / ${quota.voiceLimit} left`} />
      </View>
      <Text style={styles.quotaFootnote}>Fresh voice is optional. Replaying existing narration does not use another voice slot.</Text>
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
      <Text style={styles.plotPremise} numberOfLines={2}>{plot.premise}</Text>
      <Text style={styles.resumeLine} numberOfLines={2}>Previously: {plot.resumeLine}</Text>
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
  howCard: { backgroundColor: colors.surfaceQuiet },
  howSteps: { gap: spacing.md },
  howStep: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  howNumber: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.accent },
  howNumberText: { color: colors.accentInk, fontSize: 13, fontWeight: '900' },
  howCopy: { flex: 1, gap: spacing.xs },
  howTitle: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  howBody: { color: colors.inkMuted, fontSize: 13, lineHeight: 20 },
  retentionCard: {
    backgroundColor: colors.surfaceSuccess,
    borderColor: colors.borderSuccess,
  },
  retentionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  retentionCopy: { flex: 1, gap: spacing.xs },
  retentionTitle: { color: colors.ink, fontSize: 22, lineHeight: 28, fontWeight: '900' },
  retentionBody: { color: colors.inkMuted, fontSize: 13, lineHeight: 20 },
  sparkCard: { backgroundColor: colors.surfaceWarm },
  sparkHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  sparkTitle: { color: colors.accentStrong, fontSize: 24, lineHeight: 30, fontWeight: '900' },
  sparkBody: { color: colors.storyInk, fontSize: 15, lineHeight: 23 },
  quotaCard: {
    backgroundColor: colors.surfaceQuiet,
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
  resumeLine: {
    color: colors.storyInk,
    fontSize: 13,
    lineHeight: 20,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '900',
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
    color: colors.quietInk,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
});
