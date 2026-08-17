import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMobileAuth } from '@/features/auth/mobile-auth-context';
import { sharedUiCopy, useUiCopy } from '@/features/localization/ui-copy';
import type { StoryHomeSnapshot, StoryPlotSummary } from '@/features/story/contracts';
import { useStoryExperienceClient } from '@/features/story/story-client-context';
import { useRefreshOnForeground } from '@/lib/use-refresh-on-foreground';
import { ActionButton, BrandMark, Card, ErrorState, Eyebrow, LoadingState, MotionReveal, Pill, Screen } from '@/ui/primitives';
import { colors, spacing, typography } from '@/ui/theme';

export default function HomeScreen() {
  const router = useRouter();
  const auth = useMobileAuth();
  const { locale, t } = useUiCopy();
  const storyExperienceClient = useStoryExperienceClient();
  const [snapshot, setSnapshot] = useState<StoryHomeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (auth.configured && (!auth.isLoaded || !auth.isSignedIn)) return;
    setError(null);
    try {
      setSnapshot(await storyExperienceClient.loadHome());
    } catch {
      setError(t('Recent stories could not be loaded. Your canonical story data is never replaced by this screen state.', 'Không thể tải các câu chuyện gần đây. Dữ liệu câu chuyện chuẩn trên máy chủ không bị thay thế bởi trạng thái màn hình này.'));
    }
  }, [auth.configured, auth.isLoaded, auth.isSignedIn, storyExperienceClient, t]);

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
        setError(t('Recent stories could not be loaded. Your canonical story data is never replaced by this screen state.', 'Không thể tải các câu chuyện gần đây. Dữ liệu câu chuyện chuẩn trên máy chủ không bị thay thế bởi trạng thái màn hình này.'));
      });
    return () => {
      active = false;
    };
  }, [auth.configured, auth.isLoaded, auth.isSignedIn, storyExperienceClient, t]);


  if (auth.configured && !auth.isLoaded) {
    return <Screen><BrandMark /><LoadingState label={t('Loading secure Living Plot session…', 'Đang tải phiên Living Plot an toàn…')} /></Screen>;
  }

  if (auth.configured && !auth.isSignedIn) {
    return (
      <Screen>
        <BrandMark />
        <View style={styles.hero}>
          <Eyebrow>{t('Your stories, remembered', 'Câu chuyện của bạn được ghi nhớ')}</Eyebrow>
          <Text style={styles.heroTitle}>{t('Pick what happens. Come back for the consequence.', 'Chọn điều xảy ra. Quay lại để xem hậu quả.')}</Text>
          <Text style={styles.heroBody}>{t('Sign in with one email code so your stories and choices stay with you across devices.', 'Đăng nhập bằng một mã email để câu chuyện và lựa chọn đi cùng bạn trên mọi thiết bị.')}</Text>
          <ActionButton label={sharedUiCopy.signIn[locale]} onPress={() => router.push('/auth')} />
        </View>
      </Screen>
    );
  }

  if (!snapshot && !error) {
    return (
      <Screen>
        <BrandMark />
        <LoadingState label={t('Opening Living Plot…', 'Đang mở Living Plot…')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.topBar}>
        <BrandMark />
        {auth.configured && auth.isSignedIn ? <ActionButton label={sharedUiCopy.signOut[locale]} variant="ghost" onPress={() => void auth.signOut()} /> : null}
      </View>

      <View style={styles.hero}>
        <Eyebrow>{t('60–90 second interactive drama', 'Drama tương tác 60–90 giây')}</Eyebrow>
        <Text style={styles.heroTitle}>{t('Your choice writes the next scene.', 'Lựa chọn của bạn viết nên cảnh tiếp theo.')}</Text>
        <Text style={styles.heroBody}>
          {t('Create a situation, watch a short AI drama unfold, then choose one of three paths. The next episode remembers what you did.', 'Tạo một tình huống, xem drama AI ngắn diễn ra rồi chọn một trong ba hướng. Tập tiếp theo ghi nhớ điều bạn đã làm.')}
        </Text>
        <ActionButton label={t('Create a custom plot', 'Tạo cốt truyện riêng')} onPress={() => router.push('/create')} />
        <ActionButton label={t('My stories', 'Câu chuyện của tôi')} variant="secondary" onPress={() => router.push('/library')} />
        <ActionButton label={t('Settings & data', 'Cài đặt & dữ liệu')} variant="ghost" onPress={() => router.push('/settings')} />
      </View>

      <HowItWorks t={t} />

      {error ? <ErrorState title={t('Couldn’t load your stories', 'Không thể tải câu chuyện')} message={error} retryLabel={sharedUiCopy.tryAgain[locale]} onRetry={() => void load()} /> : null}

      {snapshot ? (
        <>
          {snapshot.recentPlots.length === 0 ? (
            <MotionReveal>
              <FirstRunCard snapshot={snapshot} t={t} onStart={() => {
                const prompt = snapshot.retention.dailyPrompt;
                router.push({ pathname: '/create', params: { premise: prompt.premise, mood: prompt.mood, characterName: prompt.characterName } });
              }} />
            </MotionReveal>
          ) : <MotionReveal><RetentionCard snapshot={snapshot} t={t} /></MotionReveal>}
          {snapshot.recentPlots.length > 0 ? (
            <MotionReveal delay={70}>
              <DailySparkCard snapshot={snapshot} t={t} onStart={() => {
                const prompt = snapshot.retention.dailyPrompt;
                router.push({ pathname: '/create', params: { premise: prompt.premise, mood: prompt.mood, characterName: prompt.characterName } });
              }} />
            </MotionReveal>
          ) : null}
          <QuotaCard snapshot={snapshot} t={t} />
          <ActionButton label={t('Unlock more episodes', 'Mở thêm tập')} variant="secondary" onPress={() => router.push('/plus')} />
          <View style={styles.sectionHeader}>
            <View>
              <Eyebrow>{t('Continue the drama', 'Tiếp tục drama')}</Eyebrow>
              <Text style={styles.sectionTitle}>{t('Pick up where you left off', 'Tiếp tục từ nơi bạn dừng')}</Text>
            </View>
            <Text style={styles.sectionMeta}>{snapshot.recentPlots.length} {t('active', 'đang hoạt động')}</Text>
          </View>

          <View style={styles.plotList}>
            {snapshot.recentPlots.length === 0 ? (
              <Card>
                <Eyebrow>{t('No active plots', 'Chưa có cốt truyện hoạt động')}</Eyebrow>
                <Text style={styles.emptyTitle}>{t('No stories yet.', 'Chưa có câu chuyện nào.')}</Text>
                <Text style={styles.plotPremise}>{t('Use today’s spark above or create your own setup. Episode 1 does the rest.', 'Dùng gợi ý hôm nay ở trên hoặc tự tạo thiết lập. Tập 1 sẽ lo phần còn lại.')}</Text>
              </Card>
            ) : snapshot.recentPlots.map((plot) => (
              <RecentPlotCard
                key={plot.id}
                plot={plot}
                t={t}
                onPress={() => router.push({ pathname: '/story', params: { plotId: plot.id } })}
              />
            ))}
          </View>
        </>
      ) : null}

      {!auth.configured ? <Text style={styles.previewNote}>{t('Preview build · all core screens are available without signing in.', 'Bản xem trước · mọi màn hình chính đều dùng được mà không cần đăng nhập.')}</Text> : null}
    </Screen>
  );
}

type Translate = (en: string, vi: string) => string;

function HowItWorks({ t }: { t: Translate }) {
  return (
    <View style={styles.howCard}>
      <Eyebrow>{t('How Living Plot works', 'Living Plot hoạt động thế nào')}</Eyebrow>
      <View style={styles.howSteps}>
        <HowStep number="1" title={t('Set the spark', 'Đặt tia lửa')} body={t('Give us the situation, mood and one main character.', 'Cho biết tình huống, không khí và một nhân vật chính.')} />
        <HowStep number="2" title={t('Watch the episode', 'Xem tập truyện')} body={t('AI turns it into a short, dramatic scene you can read or hear.', 'AI biến nó thành một cảnh drama ngắn để bạn đọc hoặc nghe.')} />
        <HowStep number="3" title={t('Choose the consequence', 'Chọn hậu quả')} body={t('Pick A, B or C. The next episode continues from that exact decision.', 'Chọn A, B hoặc C. Tập sau tiếp tục chính xác từ quyết định đó.')} />
      </View>
    </View>
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

function FirstRunCard({ snapshot, t, onStart }: { snapshot: StoryHomeSnapshot; t: Translate; onStart: () => void }) {
  const prompt = snapshot.retention.dailyPrompt;
  return (
    <Card style={styles.sparkCard}>
      <View style={styles.sparkHeader}>
        <Eyebrow>{t('Your fastest first episode', 'Tập đầu nhanh nhất')}</Eyebrow>
        <Pill tone="accent">{prompt.mood}</Pill>
      </View>
      <Text style={styles.sparkTitle}>{prompt.label}</Text>
      <Text style={styles.sparkBody}>{prompt.premise}</Text>
      <Text style={styles.retentionBody}>{t('We filled the three setup choices for you. Review them, then start episode 1 with one press.', 'Ba lựa chọn thiết lập đã được điền sẵn. Xem lại rồi bắt đầu tập 1 chỉ với một lần nhấn.')}</Text>
      <ActionButton label={t('Use this spark', 'Dùng gợi ý này')} onPress={onStart} />
    </Card>
  );
}

function RetentionCard({ snapshot, t }: { snapshot: StoryHomeSnapshot; t: Translate }) {
  const { retention } = snapshot;
  return (
    <View style={styles.retentionCard}>
      <View style={styles.retentionHeader}>
        <View style={styles.retentionCopy}>
          <Eyebrow>{t('Your momentum', 'Nhịp của bạn')}</Eyebrow>
          <Text style={styles.retentionTitle}>{retention.currentStreakDays > 0 ? t(`${retention.currentStreakDays}-day story streak`, `Chuỗi ${retention.currentStreakDays} ngày`) : t('One choice starts the streak', 'Một lựa chọn sẽ bắt đầu chuỗi')}</Text>
        </View>
        <Pill tone={retention.currentStreakDays > 0 ? 'success' : 'neutral'}>{retention.choicesMade} {t('choices', 'lựa chọn')}</Pill>
      </View>
      <Text style={styles.retentionBody}>{retention.activePlots} {t('active stories', 'câu chuyện đang hoạt động')} · {retention.choicesMade} {t('decisions made.', 'quyết định đã đưa ra.')}</Text>
    </View>
  );
}

function DailySparkCard({ snapshot, t, onStart }: { snapshot: StoryHomeSnapshot; t: Translate; onStart: () => void }) {
  const prompt = snapshot.retention.dailyPrompt;
  return (
    <Card style={styles.sparkCard}>
      <View style={styles.sparkHeader}>
        <Eyebrow>{t('Today’s spark', 'Gợi ý hôm nay')}</Eyebrow>
        <Pill tone="accent">{prompt.mood}</Pill>
      </View>
      <Text style={styles.sparkTitle}>{prompt.label}</Text>
      <Text style={styles.sparkBody}>{prompt.premise}</Text>
      <ActionButton label={t('Use this spark', 'Dùng gợi ý này')} variant="secondary" onPress={onStart} />
    </Card>
  );
}

function QuotaCard({ snapshot, t }: { snapshot: StoryHomeSnapshot; t: Translate }) {
  const { quota } = snapshot;
  return (
    <View style={styles.quotaCard}>
      <View style={styles.quotaHeader}>
        <View>
          <Eyebrow>{t('Today', 'Hôm nay')}</Eyebrow>
          <Text style={styles.quotaTitle}>{t('Your episode allowance', 'Hạn mức tập của bạn')}</Text>
        </View>
        <Pill tone="accent">{t(quota.resetLabel, 'Đặt lại lúc 00:00 UTC')}</Pill>
      </View>
      <View style={styles.quotaRows}>
        <QuotaMetric label={t('Text episodes', 'Tập chữ')} value={t(`${quota.textRemaining} / ${quota.textLimit} left`, `còn ${quota.textRemaining} / ${quota.textLimit}`)} />
        <QuotaMetric label={t('Fresh voice', 'Giọng mới')} value={t(`${quota.voiceRemaining} / ${quota.voiceLimit} left`, `còn ${quota.voiceRemaining} / ${quota.voiceLimit}`)} />
      </View>
      <Text style={styles.quotaFootnote}>{t('Fresh voice is optional. Replaying existing narration does not use another voice slot.', 'Giọng đọc mới là tùy chọn. Phát lại bản đã tạo không dùng thêm lượt giọng.')}</Text>
    </View>
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

function RecentPlotCard({ plot, t, onPress }: { plot: StoryPlotSummary; t: Translate; onPress: () => void }) {
  const statusLabel = plot.status === 'awaiting_choice' ? t('Awaiting your choice', 'Đang chờ lựa chọn') : t('Ready for next episode', 'Sẵn sàng cho tập tiếp theo');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(`Resume ${plot.title}`, `Tiếp tục ${plot.title}`)}
      onPress={onPress}
      style={({ pressed }) => [styles.plotCard, pressed && styles.pressed]}
    >
      <View style={styles.plotTopRow}>
        <Pill tone={plot.status === 'awaiting_choice' ? 'accent' : 'success'}>{statusLabel}</Pill>
        <Text style={styles.plotEpisode}>EP {plot.episodeNumber}</Text>
      </View>
      <Text style={styles.plotTitle}>{plot.title}</Text>
      <Text style={styles.plotPremise} numberOfLines={2}>{plot.premise}</Text>
      <Text style={styles.resumeLine} numberOfLines={2}>{t('Previously:', 'Trước đó:')} {plot.resumeLine}</Text>
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
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  heroTitle: {
    color: colors.ink,
    fontFamily: typography.display,
    fontSize: 44,
    lineHeight: 49,
    fontWeight: '700',
    letterSpacing: -1.35,
  },
  heroBody: {
    color: colors.inkMuted,
    fontSize: 16,
    lineHeight: 25,
    maxWidth: 560,
  },
  howCard: {
    gap: spacing.lg,
    paddingVertical: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  howSteps: { gap: spacing.lg },
  howStep: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  howNumber: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.accentSoft },
  howNumberText: { color: colors.accentStrong, fontFamily: typography.mono, fontSize: 11, fontWeight: '800' },
  howCopy: { flex: 1, gap: spacing.xs },
  howTitle: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  howBody: { color: colors.inkMuted, fontSize: 13, lineHeight: 20 },
  retentionCard: {
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  retentionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  retentionCopy: { flex: 1, gap: spacing.xs },
  retentionTitle: { color: colors.ink, fontFamily: typography.display, fontSize: 24, lineHeight: 30, fontWeight: '700' },
  retentionBody: { color: colors.inkMuted, fontSize: 13, lineHeight: 20 },
  sparkCard: {
    paddingVertical: spacing.xl,
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: colors.surfaceWarm,
  },
  sparkHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  sparkTitle: { color: colors.accentStrong, fontFamily: typography.display, fontSize: 29, lineHeight: 35, fontWeight: '700' },
  sparkBody: { color: colors.storyInk, fontSize: 15, lineHeight: 23 },
  quotaCard: {
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
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
    paddingVertical: spacing.sm,
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
    fontFamily: typography.display,
    fontSize: 31,
    lineHeight: 36,
    fontWeight: '700',
    letterSpacing: -0.8,
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
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderStrong,
    backgroundColor: 'transparent',
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
    fontFamily: typography.display,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '700',
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
