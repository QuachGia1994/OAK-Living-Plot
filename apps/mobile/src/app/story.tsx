import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Share, StyleSheet, Text, View } from 'react-native';
import { EpisodeVoiceCard } from '@/features/audio/episode-voice-card';
import type { StoryPlotSession } from '@/features/story/contracts';
import { StoryClientError } from '@/features/story/contracts';
import { useMobileAuth } from '@/features/auth/mobile-auth-context';
import { sharedUiCopy, useUiCopy } from '@/features/localization/ui-copy';
import { buildSpoilerSafeShareText } from '@/features/share/story-share';
import { useStoryExperienceClient } from '@/features/story/story-client-context';
import { useRefreshOnForeground } from '@/lib/use-refresh-on-foreground';
import { DramaChoiceCard, DramaLoadingStage, DramaSceneStage } from '@/ui/drama-visuals';
import { ActionButton, BrandMark, Card, ErrorState, Eyebrow, MotionReveal, Pill, Screen } from '@/ui/primitives';
import { colors, spacing, typography } from '@/ui/theme';

export default function StoryScreen() {
  const router = useRouter();
  const auth = useMobileAuth();
  const { locale, t } = useUiCopy();
  const storyExperienceClient = useStoryExperienceClient();
  const params = useLocalSearchParams<{ plotId?: string | string[]; readOnly?: string | string[] }>();
  const plotId = useMemo(() => readParam(params.plotId), [params.plotId]);
  const readOnly = useMemo(() => readParam(params.readOnly) === '1', [params.readOnly]);
  const [session, setSession] = useState<StoryPlotSession | null>(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<'commit' | 'next' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!plotId) {
      setError(t('This story link is missing its plot identifier.', 'Liên kết câu chuyện thiếu mã cốt truyện.'));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setSession(await storyExperienceClient.loadPlot(plotId));
    } catch (caught) {
      setError(messageForError(caught, locale, t('This story could not be resumed.', 'Không thể tiếp tục câu chuyện này.')));
    } finally {
      setLoading(false);
    }
  }, [locale, plotId, storyExperienceClient, t]);

  const refresh = useCallback(async () => {
    if (!plotId || (auth.configured && (!auth.isLoaded || !auth.isSignedIn))) return;
    try {
      setSession(await storyExperienceClient.loadPlot(plotId));
      setError(null);
    } catch (caught) {
      setError(messageForError(caught, locale, t('This story could not be refreshed.', 'Không thể làm mới câu chuyện này.')));
    }
  }, [auth.configured, auth.isLoaded, auth.isSignedIn, locale, plotId, storyExperienceClient, t]);

  useRefreshOnForeground(refresh);

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
        setError(messageForError(caught, locale, t('This story could not be resumed.', 'Không thể tiếp tục câu chuyện này.')));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [auth.configured, auth.isLoaded, auth.isSignedIn, locale, plotId, storyExperienceClient, t]);

  async function commitChoice() {
    if (!session || !selectedChoiceId) return;
    setBusyAction('commit');
    setError(null);
    try {
      const updated = await storyExperienceClient.commitChoice(session.id, session.episode.id, selectedChoiceId);
      setSession(updated);
      setSelectedChoiceId(null);
    } catch (caught) {
      setError(messageForError(caught, locale, t('The choice could not be committed. Try again without changing your selection.', 'Không thể chốt lựa chọn. Hãy thử lại mà không đổi lựa chọn.')));
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
      setError(messageForError(caught, locale, t('The next episode could not be prepared. Your committed choice is still safe.', 'Không thể chuẩn bị tập tiếp theo. Lựa chọn đã chốt vẫn an toàn.')));
    } finally {
      setBusyAction(null);
    }
  }

  if (auth.configured && (!auth.isLoaded || !auth.isSignedIn)) {
    return (
      <Screen>
        <BrandMark />
        <ErrorState
          title={auth.isLoaded ? t('Sign in to continue this story', 'Đăng nhập để tiếp tục câu chuyện') : t('Opening your account…', 'Đang mở tài khoản…')}
          message={t('Sign in so Living Plot can remember your past choices and continue from the right scene.', 'Đăng nhập để Living Plot nhớ các lựa chọn trước và tiếp tục đúng cảnh.')}
        />
        {auth.isLoaded ? <ActionButton label={t('Sign in with email code', 'Đăng nhập bằng mã email')} onPress={() => router.replace('/auth')} /> : null}
        <ActionButton label={t('Back to home', 'Về trang chủ')} variant="ghost" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  if (!plotId) {
    return (
      <Screen>
        <BrandMark />
        <ErrorState title={t('Story unavailable', 'Câu chuyện không khả dụng')} message={t('This story link is missing its plot identifier.', 'Liên kết câu chuyện thiếu mã cốt truyện.')} />
        <ActionButton label={t('Back to home', 'Về trang chủ')} variant="ghost" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  if (loading) {
    return (
      <Screen contentStyle={styles.playerScreen}>
        <View style={styles.topBar}>
          <BrandMark />
        </View>
        <DramaLoadingStage
          label={t('Opening your latest scene…', 'Đang mở cảnh mới nhất…')}
          detail={t('Restoring the episode, your last decision and the scene framing.', 'Đang khôi phục tập truyện, lựa chọn gần nhất và bố cục cảnh.')}
        />
      </Screen>
    );
  }

  if (!session) {
    return (
      <Screen>
        <BrandMark />
        <ErrorState title={t('Story unavailable', 'Câu chuyện không khả dụng')} message={error ?? t('This story could not be loaded.', 'Không thể tải câu chuyện này.')} retryLabel={sharedUiCopy.tryAgain[locale]} onRetry={() => void load()} />
        <ActionButton label={t('Back to home', 'Về trang chủ')} variant="ghost" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  const episode = session.episode;
  const selectedChoice = episode.choices.find((choice) => choice.id === selectedChoiceId);
  const awaitingChoice = episode.status === 'awaiting_choice';

  return (
    <Screen contentStyle={styles.playerScreen}>
      <View style={styles.topBar}>
        <BrandMark />
        <ActionButton label={t('My stories', 'Câu chuyện của tôi')} variant="ghost" onPress={() => router.push('/library')} />
      </View>

      <MotionReveal key={`scene-${episode.id}-${episode.status}`}>
        <DramaSceneStage
          episodeNumber={episode.number}
          title={episode.title}
          body={episode.body}
          characterName={session.characterName}
          mood={session.mood}
          consequence={awaitingChoice ? undefined : episode.committedConsequence}
        />
      </MotionReveal>

      <View style={styles.playerBody}>
        <View style={styles.plotRail}>
          <View style={styles.plotRailTop}>
            <Pill tone={awaitingChoice ? 'accent' : 'success'}>{awaitingChoice ? t('Decision point', 'Điểm quyết định') : t('Choice locked', 'Đã chốt lựa chọn')}</Pill>
            <Text style={styles.plotMeta}>{session.characterName} · {session.mood}</Text>
          </View>
          <Text style={styles.plotTitle}>{session.title}</Text>
          <View style={styles.storyActions}>
            <ActionButton
              label={t('Share', 'Chia sẻ')}
              variant="ghost"
              onPress={() => void Share.share({ message: buildSpoilerSafeShareText({ title: session.title, episodeNumber: episode.number, premise: session.premise }) })}
            />
            <ActionButton label={t('History', 'Lịch sử')} variant="ghost" onPress={() => router.push({ pathname: '/history', params: { plotId: session.id } })} />
          </View>
        </View>

        {error ? (
          <ErrorState
            title={t('That action didn’t finish', 'Thao tác chưa hoàn tất')}
            message={error}
            retryLabel={sharedUiCopy.tryAgain[locale]}
            onRetry={selectedChoiceId ? () => void commitChoice() : undefined}
          />
        ) : null}

        {readOnly ? (
          <Card style={styles.readOnlyCard}>
            <Eyebrow>{t('Archived story', 'Câu chuyện đã tạm dừng')}</Eyebrow>
            <Text style={styles.readOnlyTitle}>{t('This story is paused.', 'Câu chuyện này đang tạm dừng.')}</Text>
            <Text style={styles.supportCopy}>{t('Restore it from My Stories when you want to make another choice or continue the next episode.', 'Khôi phục từ Câu chuyện của tôi khi bạn muốn chọn tiếp hoặc sang tập mới.')}</Text>
            <ActionButton label={t('Open story library', 'Mở thư viện câu chuyện')} variant="secondary" onPress={() => router.push('/library')} />
          </Card>
        ) : awaitingChoice ? (
          <MotionReveal key={`choice-${episode.id}`}>
            <View style={styles.choiceSection}>
              <View style={styles.choiceHeading}>
                <Eyebrow>{t('Choose the next turn', 'Chọn bước ngoặt tiếp theo')}</Eyebrow>
                <Text style={styles.choiceTitle}>{t(`What should ${session.characterName} do next?`, `${session.characterName} nên làm gì tiếp theo?`)}</Text>
                <Text style={styles.choiceSupport}>{t('Three paths. One becomes canon.', 'Ba hướng đi. Chỉ một hướng trở thành câu chuyện chuẩn.')}</Text>
              </View>

              <View style={styles.choiceGrid}>
                {episode.choices.map((choice) => (
                  <DramaChoiceCard
                    key={choice.id}
                    choice={choice}
                    selected={choice.id === selectedChoiceId}
                    disabled={busyAction !== null}
                    mood={session.mood}
                    onPress={() => setSelectedChoiceId(choice.id)}
                  />
                ))}
              </View>

              <View style={styles.commitDock}>
                <View style={styles.commitCopy}>
                  <Text style={styles.commitLabel}>{selectedChoice ? t('READY TO LOCK', 'SẴN SÀNG CHỐT') : t('YOUR MOVE', 'LƯỢT CỦA BẠN')}</Text>
                  <Text style={styles.commitText} numberOfLines={2}>{selectedChoice?.label ?? t('Pick a path to continue the drama.', 'Chọn một hướng để tiếp tục drama.')}</Text>
                </View>
                <ActionButton
                  label={t('Lock this turn', 'Chốt hướng này')}
                  busy={busyAction === 'commit'}
                  disabled={!selectedChoice}
                  onPress={() => void commitChoice()}
                />
              </View>
            </View>
          </MotionReveal>
        ) : (
          <MotionReveal key={`consequence-${episode.id}`}>
            <View style={styles.nextSection}>
              <Eyebrow>{t('Scene complete', 'Cảnh đã hoàn tất')}</Eyebrow>
              <Text style={styles.nextTitle}>{t('The next scene starts from this exact consequence.', 'Cảnh tiếp theo bắt đầu chính từ hậu quả này.')}</Text>
              <ActionButton
                label={t(`Play episode ${episode.number + 1}`, `Xem tập ${episode.number + 1}`)}
                busy={busyAction === 'next'}
                onPress={() => void requestNextEpisode()}
              />
              <Text style={styles.supportCopy}>{t('Your locked choice remains canonical even if generation needs a retry.', 'Lựa chọn đã chốt vẫn là bản chuẩn ngay cả khi việc tạo tập mới cần thử lại.')}</Text>
            </View>
          </MotionReveal>
        )}

        <EpisodeVoiceCard key={episode.id} episodeId={episode.id} />
      </View>
    </Screen>
  );
}

function readParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return value?.trim() || null;
}

function messageForError(error: unknown, locale: 'en' | 'vi', fallback: string): string {
  if (!(error instanceof StoryClientError)) return fallback;
  const vi = locale === 'vi';
  if (error.code === 'choice_conflict') return vi ? 'Một lựa chọn khác đã là bản chuẩn của tập này. Tải lại để xem.' : 'A different choice is already canonical for this episode. Resume to see it.';
  if (error.code === 'choice_required') return vi ? 'Chọn và chốt một hành động trước khi yêu cầu tập tiếp theo.' : 'Choose and commit one action before requesting the next episode.';
  if (error.code === 'not_found') return vi ? 'Cốt truyện hoặc lựa chọn này không còn khớp trạng thái hiện tại.' : 'This plot or choice no longer matches the current story state.';
  if (error.code === 'auth_required') return vi ? 'Đăng nhập lại trước khi tiếp tục câu chuyện chuẩn.' : 'Sign in again before continuing this canonical story.';
  if (error.code === 'quota_exceeded') return vi ? 'Bạn đã dùng hết lượt tập chữ hôm nay. Hạn mức đặt lại lúc 00:00 UTC.' : 'Today’s text episode allowance is exhausted. It resets at 00:00 UTC.';
  if (error.code === 'provider_unavailable') return vi ? 'Tạo truyện tạm thời không khả dụng. Trạng thái chuẩn của bạn không thay đổi.' : 'Story generation is temporarily unavailable. Your canonical state is unchanged.';
  return fallback;
}

const styles = StyleSheet.create({
  playerScreen: {
    gap: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  topBar: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background,
  },
  playerBody: {
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  plotRail: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderStrong,
  },
  plotRailTop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  plotTitle: {
    color: colors.ink,
    fontFamily: typography.display,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '700',
  },
  plotMeta: {
    color: colors.inkMuted,
    fontFamily: typography.mono,
    fontSize: 10,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  storyActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginHorizontal: -spacing.sm,
  },
  choiceSection: {
    gap: spacing.lg,
    paddingTop: spacing.md,
  },
  choiceHeading: {
    gap: spacing.sm,
  },
  choiceTitle: {
    maxWidth: 520,
    color: colors.ink,
    fontFamily: typography.display,
    fontSize: 33,
    lineHeight: 38,
    fontWeight: '700',
    letterSpacing: -0.7,
  },
  choiceSupport: {
    color: colors.inkMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  choiceGrid: {
    gap: spacing.sm,
  },
  commitDock: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
  },
  commitCopy: {
    gap: spacing.xs,
  },
  commitLabel: {
    color: colors.accentStrong,
    fontFamily: typography.mono,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  commitText: {
    color: colors.ink,
    fontFamily: typography.display,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '700',
  },
  nextSection: {
    gap: spacing.md,
    paddingVertical: spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
  },
  nextTitle: {
    color: colors.ink,
    fontFamily: typography.display,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
  },
  supportCopy: {
    color: colors.inkMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  readOnlyCard: {
    backgroundColor: colors.surfaceQuiet,
  },
  readOnlyTitle: {
    color: colors.ink,
    fontFamily: typography.display,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
  },
});
