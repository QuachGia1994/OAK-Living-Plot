import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { EpisodeVoiceCard } from '@/features/audio/episode-voice-card';
import type { StoryChoice, StoryPlotSession } from '@/features/story/contracts';
import { StoryClientError } from '@/features/story/contracts';
import { useMobileAuth } from '@/features/auth/mobile-auth-context';
import { sharedUiCopy, useUiCopy } from '@/features/localization/ui-copy';
import { buildSpoilerSafeShareText } from '@/features/share/story-share';
import { useStoryExperienceClient } from '@/features/story/story-client-context';
import { useRefreshOnForeground } from '@/lib/use-refresh-on-foreground';
import { ActionButton, BrandMark, Card, ErrorState, Eyebrow, LoadingState, Pill, Screen } from '@/ui/primitives';
import { colors, radius, spacing, typography } from '@/ui/theme';

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
      const updated = await storyExperienceClient.commitChoice(
        session.id,
        session.episode.id,
        selectedChoiceId,
      );
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
      <Screen>
        <BrandMark />
        <LoadingState label={t('Opening your latest episode…', 'Đang mở tập mới nhất…')} />
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
    <Screen>
      <View style={styles.topBar}>
        <BrandMark />
        <View style={styles.topActions}>
          <ActionButton
            label={t('Share', 'Chia sẻ')}
            variant="ghost"
            onPress={() => void Share.share({ message: buildSpoilerSafeShareText({ title: session.title, episodeNumber: episode.number, premise: session.premise }) })}
          />
          <ActionButton label={t('History', 'Lịch sử')} variant="ghost" onPress={() => router.push({ pathname: '/history', params: { plotId: session.id } })} />
          <ActionButton label={t('All plots', 'Tất cả cốt truyện')} variant="ghost" onPress={() => router.replace('/')} />
        </View>
      </View>

      <View style={styles.plotHeader}>
        <View style={styles.plotMetaRow}>
          <Pill tone={awaitingChoice ? 'accent' : 'success'}>
            {awaitingChoice ? t('Your move', 'Lượt của bạn') : t('Choice locked in', 'Đã chốt lựa chọn')}
          </Pill>
          <Text style={styles.episodeNumber}>EP {episode.number}</Text>
        </View>
        <Text style={styles.plotTitle}>{session.title}</Text>
        <Text style={styles.plotMeta}>{session.characterName} · {session.mood}</Text>
      </View>

      <View style={styles.episodeBlock}>
        <Eyebrow>{t(`Episode ${episode.number}`, `Tập ${episode.number}`)}</Eyebrow>
        <Text style={styles.episodeTitle}>{episode.title}</Text>
        <Text style={styles.episodeBody}>{episode.body}</Text>
      </View>

      <EpisodeVoiceCard key={episode.id} episodeId={episode.id} />

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
          <Text style={styles.commitEmpty}>{t('Restore it from My Stories when you want to make another choice or continue the next episode.', 'Khôi phục từ Câu chuyện của tôi khi bạn muốn chọn tiếp hoặc sang tập mới.')}</Text>
          <ActionButton label={t('Open story library', 'Mở thư viện câu chuyện')} variant="secondary" onPress={() => router.push('/library')} />
        </Card>
      ) : awaitingChoice ? (
        <View style={styles.choiceSection}>
          <View style={styles.choiceHeading}>
            <View style={styles.choiceHeadingText}>
              <Eyebrow>{t('Choose the next turn', 'Chọn bước ngoặt tiếp theo')}</Eyebrow>
              <Text style={styles.choiceTitle}>{t(`What should ${session.characterName} do?`, `${session.characterName} nên làm gì?`)}</Text>
            </View>
            <Pill>{t('Choose 1 of 3', 'Chọn 1 trong 3')}</Pill>
          </View>

          <View style={styles.choiceList}>
            {episode.choices.map((choice) => (
              <ChoiceCard
                key={choice.id}
                choice={choice}
                selected={choice.id === selectedChoiceId}
                disabled={busyAction !== null}
                t={t}
                onPress={() => setSelectedChoiceId(choice.id)}
              />
            ))}
          </View>

          <Card style={styles.commitCard}>
            {selectedChoice ? (
              <>
                <Text style={styles.commitLabel}>{t('Your pick', 'Lựa chọn của bạn')}</Text>
                <Text style={styles.commitChoice}>{selectedChoice.label}</Text>
                <Text style={styles.commitIntent}>{t('Intent:', 'Ý định:')} {selectedChoice.intent}</Text>
              </>
            ) : (
              <Text style={styles.commitEmpty}>{t('Pick A, B or C. You can still change your mind before locking it in.', 'Chọn A, B hoặc C. Bạn vẫn có thể đổi ý trước khi chốt.')}</Text>
            )}
            <ActionButton
              label={t('Lock in this choice', 'Chốt lựa chọn này')}
              busy={busyAction === 'commit'}
              disabled={!selectedChoice}
              onPress={() => void commitChoice()}
            />
          </Card>
        </View>
      ) : (
        <View style={styles.consequenceSection}>
          <Card style={styles.consequenceCard}>
            <Eyebrow>{t('The consequence', 'Hậu quả')}</Eyebrow>
            <Text style={styles.consequenceTitle}>{t('That choice changed what happens next.', 'Lựa chọn đó đã thay đổi điều xảy ra tiếp theo.')}</Text>
            <Text style={styles.consequenceBody}>{episode.committedConsequence}</Text>
          </Card>
          <ActionButton
            label={t(`Continue to episode ${episode.number + 1}`, `Tiếp tục tới tập ${episode.number + 1}`)}
            busy={busyAction === 'next'}
            onPress={() => void requestNextEpisode()}
          />
          <Text style={styles.nextNote}>
            {t('The next episode continues directly from the consequence you just created.', 'Tập tiếp theo tiếp tục trực tiếp từ hậu quả bạn vừa tạo ra.')}
          </Text>
        </View>
      )}
    </Screen>
  );
}

type Translate = (en: string, vi: string) => string;

function ChoiceCard({
  choice,
  selected,
  disabled,
  t,
  onPress,
}: {
  choice: StoryChoice;
  selected: boolean;
  disabled: boolean;
  t: Translate;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(`Choice ${choice.key}: ${choice.label}`, `Lựa chọn ${choice.key}: ${choice.label}`)}
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  plotHeader: {
    gap: spacing.sm,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderStrong,
  },
  plotMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  episodeNumber: {
    color: colors.inkMuted,
    fontFamily: typography.mono,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.7,
  },
  plotTitle: {
    color: colors.ink,
    fontFamily: typography.display,
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '700',
  },
  plotMeta: {
    color: colors.inkMuted,
    fontSize: 12,
    textTransform: 'capitalize',
  },
  episodeBlock: {
    gap: spacing.md,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  episodeTitle: {
    color: colors.ink,
    fontFamily: typography.display,
    fontSize: 40,
    lineHeight: 45,
    fontWeight: '700',
    letterSpacing: -1.05,
  },
  episodeBody: {
    color: colors.storyInk,
    fontFamily: typography.display,
    fontSize: 19,
    lineHeight: 32,
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
    fontFamily: typography.display,
    fontSize: 29,
    lineHeight: 35,
    fontWeight: '700',
  },
  choiceList: {
    gap: spacing.sm,
  },
  choiceCard: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderStrong,
    borderRadius: 0,
    backgroundColor: 'transparent',
  },
  choiceCardSelected: {
    borderBottomColor: colors.accent,
    backgroundColor: colors.surfaceWarmDeep,
  },
  choicePressed: {
    opacity: 0.78,
  },
  choiceKey: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: 'transparent',
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
    fontFamily: typography.display,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '700',
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
    borderWidth: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
    borderRadius: 0,
    backgroundColor: 'transparent',
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
  readOnlyCard: { backgroundColor: colors.surfaceQuiet },
  readOnlyTitle: { color: colors.ink, fontSize: 22, lineHeight: 28, fontWeight: '900' },
  consequenceSection: {
    gap: spacing.md,
  },
  consequenceCard: {
    paddingVertical: spacing.xl,
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: colors.surfaceWarm,
  },
  consequenceTitle: {
    color: colors.accentStrong,
    fontFamily: typography.display,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },
  consequenceBody: {
    color: colors.ink,
    fontFamily: typography.display,
    fontSize: 18,
    lineHeight: 29,
  },
  nextNote: {
    color: colors.inkMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
