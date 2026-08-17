import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useMobileAuth } from '@/features/auth/mobile-auth-context';
import { sharedUiCopy, useUiCopy } from '@/features/localization/ui-copy';
import type { StoryHomeSnapshot, StoryPlotSummary } from '@/features/story/contracts';
import { useStoryExperienceClient } from '@/features/story/story-client-context';
import { useRefreshOnForeground } from '@/lib/use-refresh-on-foreground';
import { DramaCoverTile, DramaLoadingStage, DramaPoster } from '@/ui/drama-visuals';
import { ActionButton, BrandMark, ErrorState, Eyebrow, Screen } from '@/ui/primitives';
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

  function openDailySpark(source: StoryHomeSnapshot) {
    const prompt = source.retention.dailyPrompt;
    router.push({ pathname: '/create', params: { premise: prompt.premise, mood: prompt.mood, characterName: prompt.characterName } });
  }

  useEffect(() => {
    if (auth.configured && (!auth.isLoaded || !auth.isSignedIn)) return;
    let active = true;
    void storyExperienceClient.loadHome()
      .then((next) => {
        if (!active) return;
        setSnapshot(next);
        setError(null);
      })
      .catch(() => {
        if (!active) return;
        setError(t('Recent stories could not be loaded. Your canonical story data is never replaced by this screen state.', 'Không thể tải các câu chuyện gần đây. Dữ liệu câu chuyện chuẩn trên máy chủ không bị thay thế bởi trạng thái màn hình này.'));
      });
    return () => { active = false; };
  }, [auth.configured, auth.isLoaded, auth.isSignedIn, storyExperienceClient, t]);

  if (auth.configured && !auth.isLoaded) {
    return <Screen><BrandMark /><DramaLoadingStage label={t('Opening your Living Plot session…', 'Đang mở phiên Living Plot…')} /></Screen>;
  }

  if (auth.configured && !auth.isSignedIn) {
    return (
      <Screen>
        <BrandMark />
        <View style={styles.authHero}>
          <Eyebrow>{t('Your stories, remembered', 'Câu chuyện của bạn được ghi nhớ')}</Eyebrow>
          <Text style={styles.authTitle}>{t('Pick what happens. Come back for the consequence.', 'Chọn điều xảy ra. Quay lại để xem hậu quả.')}</Text>
          <Text style={styles.authBody}>{t('Sign in with one email code so your stories and choices stay with you across devices.', 'Đăng nhập bằng một mã email để câu chuyện và lựa chọn đi cùng bạn trên mọi thiết bị.')}</Text>
          <ActionButton label={sharedUiCopy.signIn[locale]} onPress={() => router.push('/auth')} />
        </View>
      </Screen>
    );
  }

  if (!snapshot && !error) {
    return (
      <Screen>
        <BrandMark />
        <DramaLoadingStage
          label={t('Opening tonight’s drama…', 'Đang mở drama tối nay…')}
          detail={t('Framing your latest story and restoring the next decision point.', 'Đang dựng lại câu chuyện gần nhất và điểm quyết định tiếp theo.')}
        />
      </Screen>
    );
  }

  const featuredPlot = snapshot?.recentPlots[0] ?? null;
  const dailyPrompt = snapshot?.retention.dailyPrompt ?? null;

  return (
    <Screen>
      <View style={styles.topBar}>
        <BrandMark />
        {auth.configured && auth.isSignedIn ? <ActionButton label={sharedUiCopy.signOut[locale]} variant="ghost" onPress={() => void auth.signOut()} /> : null}
      </View>

      {snapshot && dailyPrompt ? (
        <>
          <DramaPoster
            title={featuredPlot?.title ?? dailyPrompt.label}
            premise={featuredPlot?.resumeLine ?? dailyPrompt.premise}
            characterName={featuredPlot?.characterName ?? dailyPrompt.characterName}
            mood={featuredPlot?.mood ?? dailyPrompt.mood}
            episodeLabel={featuredPlot
              ? t(`EP ${featuredPlot.episodeNumber} · CONTINUE`, `TẬP ${featuredPlot.episodeNumber} · TIẾP TỤC`)
              : t('TODAY · NEW DRAMA', 'HÔM NAY · DRAMA MỚI')}
            actionLabel={featuredPlot ? t('Resume drama', 'Tiếp tục drama') : t('Play today’s story', 'Xem câu chuyện hôm nay')}
            onPress={() => featuredPlot
              ? router.push({ pathname: '/story', params: { plotId: featuredPlot.id } })
              : openDailySpark(snapshot)}
            style={styles.heroPoster}
          />

          <View style={styles.heroQuickActions}>
            <ActionButton label={t('Create my drama', 'Tạo drama của tôi')} variant="secondary" onPress={() => router.push('/create')} style={styles.heroQuickAction} />
            <ActionButton label={t('My shelf', 'Kệ của tôi')} variant="ghost" onPress={() => router.push('/library')} />
            <ActionButton label={t('Settings', 'Cài đặt')} variant="ghost" onPress={() => router.push('/settings')} />
          </View>
        </>
      ) : null}

      {error ? (
        <ErrorState
          title={t('Couldn’t load your stories', 'Không thể tải câu chuyện')}
          message={error}
          retryLabel={sharedUiCopy.tryAgain[locale]}
          onRetry={() => void load()}
        />
      ) : null}

      {snapshot ? (
        <>
          <StoryHud snapshot={snapshot} t={t} />

          {featuredPlot ? (
            <UpNextShelf
              snapshot={snapshot}
              featuredPlotId={featuredPlot.id}
              t={t}
              onOpenPlot={(plot) => router.push({ pathname: '/story', params: { plotId: plot.id } })}
              onOpenSpark={() => openDailySpark(snapshot)}
            />
          ) : (
            <View style={styles.firstRunCue}>
              <Text style={styles.firstRunTitle}>{t('One spark. One minute. Three ways forward.', 'Một tia lửa. Một phút. Ba hướng đi.')}</Text>
              <Text style={styles.firstRunBody}>{t('The poster above is already cast and ready. Open it, review the setup, then play episode 1.', 'Poster phía trên đã có nhân vật và sẵn sàng. Mở nó, xem lại thiết lập rồi phát tập 1.')}</Text>
            </View>
          )}

          <View style={styles.plusRow}>
            <View style={styles.plusCopy}>
              <Text style={styles.plusKicker}>{t('Need another cliffhanger?', 'Muốn thêm một cao trào?')}</Text>
              <Text style={styles.plusBody}>{t('Plus expands today’s episode and narration allowance.', 'Plus tăng hạn mức tập và giọng đọc trong ngày.')}</Text>
            </View>
            <ActionButton label={t('View Plus', 'Xem Plus')} variant="ghost" onPress={() => router.push('/plus')} />
          </View>
        </>
      ) : null}

      {!auth.configured ? <Text style={styles.previewNote}>{t('Preview build · core drama flow works without sign-in.', 'Bản xem trước · luồng drama chính hoạt động không cần đăng nhập.')}</Text> : null}
    </Screen>
  );
}

type Translate = (en: string, vi: string) => string;

function StoryHud({ snapshot, t }: { snapshot: StoryHomeSnapshot; t: Translate }) {
  const { retention, quota } = snapshot;
  return (
    <View style={styles.hud}>
      <HudMetric label={t('Streak', 'Chuỗi')} value={retention.currentStreakDays > 0 ? `${retention.currentStreakDays}D` : '—'} />
      <HudMetric label={t('Choices', 'Lựa chọn')} value={String(retention.choicesMade)} />
      <HudMetric label={t('Episodes left', 'Tập còn lại')} value={`${quota.textRemaining}/${quota.textLimit}`} accent />
      <HudMetric label={t('Voice left', 'Giọng còn lại')} value={`${quota.voiceRemaining}/${quota.voiceLimit}`} />
    </View>
  );
}

function HudMetric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.hudMetric}>
      <Text style={[styles.hudValue, accent && styles.hudValueAccent]}>{value}</Text>
      <Text style={styles.hudLabel}>{label}</Text>
    </View>
  );
}

function UpNextShelf({
  snapshot,
  featuredPlotId,
  t,
  onOpenPlot,
  onOpenSpark,
}: {
  snapshot: StoryHomeSnapshot;
  featuredPlotId: string;
  t: Translate;
  onOpenPlot: (plot: StoryPlotSummary) => void;
  onOpenSpark: () => void;
}) {
  const prompt = snapshot.retention.dailyPrompt;
  const secondaryPlots = snapshot.recentPlots.filter((plot) => plot.id !== featuredPlotId).slice(0, 3);

  return (
    <View style={styles.shelfSection}>
      <View style={styles.shelfHeader}>
        <View>
          <Eyebrow>{t('Up next', 'Tiếp theo')}</Eyebrow>
          <Text style={styles.shelfTitle}>{t('Choose another cover', 'Chọn một bìa khác')}</Text>
        </View>
        <Text style={styles.shelfCount}>{String(secondaryPlots.length + 1).padStart(2, '0')}</Text>
      </View>

      <View style={styles.coverGrid}>
        <View style={styles.coverItem}>
          <DramaCoverTile
            title={prompt.label}
            premise={prompt.premise}
            characterName={prompt.characterName}
            mood={prompt.mood}
            episodeLabel={t('NEW · TODAY', 'MỚI · HÔM NAY')}
            statusLabel={t('Start a new drama', 'Bắt đầu drama mới')}
            onPress={onOpenSpark}
          />
        </View>

        {secondaryPlots.map((plot) => (
          <View key={plot.id} style={styles.coverItem}>
            <DramaCoverTile
              title={plot.title}
              premise={plot.resumeLine || plot.premise}
              characterName={plot.characterName}
              mood={plot.mood}
              episodeLabel={`EP ${String(plot.episodeNumber).padStart(2, '0')}`}
              statusLabel={plot.status === 'awaiting_choice'
                ? t('Your choice is waiting', 'Đang chờ lựa chọn')
                : t('Next scene ready', 'Cảnh tiếp theo sẵn sàng')}
              onPress={() => onOpenPlot(plot)}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroPoster: { marginHorizontal: -spacing.lg, borderRadius: 0 },
  heroQuickActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs, marginTop: -spacing.sm },
  heroQuickAction: { flexGrow: 1, minWidth: 170 },
  authHero: { gap: spacing.md, paddingTop: spacing.xl },
  authTitle: { color: colors.ink, fontFamily: typography.display, fontSize: 40, lineHeight: 45, fontWeight: '700', letterSpacing: -1.1 },
  authBody: { color: colors.inkMuted, fontSize: 15, lineHeight: 23 },
  hud: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  hudMetric: { minWidth: 82, flex: 1, gap: 2, paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
  hudValue: { color: colors.ink, fontFamily: typography.mono, fontSize: 17, fontWeight: '900', letterSpacing: -0.3 },
  hudValueAccent: { color: colors.accentStrong },
  hudLabel: { color: colors.quietInk, fontFamily: typography.mono, fontSize: 8, lineHeight: 12, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  firstRunCue: { gap: spacing.xs, paddingVertical: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
  firstRunTitle: { color: colors.ink, fontFamily: typography.display, fontSize: 25, lineHeight: 30, fontWeight: '700' },
  firstRunBody: { color: colors.inkMuted, fontSize: 13, lineHeight: 20 },
  shelfSection: { gap: spacing.md, paddingTop: spacing.lg },
  shelfHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md },
  shelfTitle: { marginTop: spacing.xs, color: colors.ink, fontFamily: typography.display, fontSize: 29, lineHeight: 33, fontWeight: '700', letterSpacing: -0.6 },
  shelfCount: { color: colors.accentStrong, fontFamily: typography.mono, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  coverGrid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: spacing.sm },
  coverItem: { minWidth: 148, flexGrow: 1, flexBasis: '46%' },
  plusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  plusCopy: { flex: 1, minWidth: 190, gap: 3 },
  plusKicker: { color: colors.ink, fontFamily: typography.display, fontSize: 18, lineHeight: 22, fontWeight: '700' },
  plusBody: { color: colors.quietInk, fontSize: 11, lineHeight: 16 },
  previewNote: { color: colors.quietInk, fontSize: 10, lineHeight: 16, textAlign: 'center', paddingHorizontal: spacing.md },
});
