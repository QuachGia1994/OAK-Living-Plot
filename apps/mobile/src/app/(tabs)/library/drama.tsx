import { useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Share, StyleSheet, Text, View } from 'react-native';
import { SceneVoiceCard } from '@/features/audio/scene-voice-card';
import type { DramaMood } from '@/features/drama/domain';
import { useDramaPlayback, type DramaFailure } from '@/features/drama/use-drama-playback';
import { useMobileAuth } from '@/features/auth/mobile-auth-context';
import { sharedUiCopy, useUiCopy } from '@/features/localization/ui-copy';
import { buildSpoilerSafeDramaShareText } from '@/features/share/drama-share';
import { DramaChoiceCard, DramaLoadingStage, DramaSceneStage } from '@/ui/drama-visuals';
import { ActionButton, BrandMark, ErrorState, Eyebrow, MotionReveal, Screen } from '@/ui/primitives';
import { colors, radius, spacing, typography } from '@/ui/theme';

export default function DramaScreen() {
  const router = useRouter();
  const auth = useMobileAuth();
  const { locale, t } = useUiCopy();
  const params = useLocalSearchParams<{ dramaId?: string | string[]; readOnly?: string | string[] }>();
  const dramaId = useMemo(() => readParam(params.dramaId), [params.dramaId]);
  const readOnly = useMemo(() => readParam(params.readOnly) === '1', [params.readOnly]);
  const authReady = !auth.configured || (auth.isLoaded && auth.isSignedIn);
  const playback = useDramaPlayback({ dramaId, enabled: authReady });

  if (auth.configured && (!auth.isLoaded || !auth.isSignedIn)) {
    return (
      <Screen>
        <BrandMark />
        <ErrorState
          title={auth.isLoaded ? t('Sign in to continue this drama', 'Đăng nhập để tiếp tục drama') : t('Opening your account…', 'Đang mở tài khoản…')}
          message={t('Sign in so Living Plot can restore your choices and continue from the canonical scene.', 'Đăng nhập để Living Plot khôi phục các lựa chọn và tiếp tục đúng cảnh chuẩn.')}
        />
        {auth.isLoaded ? <ActionButton label={t('Sign in with email code', 'Đăng nhập bằng mã email')} onPress={() => router.replace('/auth')} /> : null}
        <ActionButton label={t('Back to home', 'Về trang chủ')} variant="ghost" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  if (!dramaId) {
    return (
      <Screen>
        <BrandMark />
        <ErrorState title={t('Drama unavailable', 'Drama không khả dụng')} message={t('This drama link is missing its identifier.', 'Liên kết drama thiếu mã định danh.')} />
        <ActionButton label={t('Back to home', 'Về trang chủ')} variant="ghost" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  if (playback.loading || playback.playbackState.phase === 'restoring') {
    return (
      <Screen contentStyle={styles.playerScreen}>
        <View style={styles.topBar}><BrandMark /></View>
        <DramaLoadingStage
          label={t('Restoring your latest scene…', 'Đang khôi phục cảnh mới nhất…')}
          detail={t('Loading the canonical drama, branch and scene state.', 'Đang tải drama, nhánh lựa chọn và trạng thái cảnh chuẩn.')}
          locale={locale}
        />
      </Screen>
    );
  }

  if (!playback.drama) {
    return (
      <Screen>
        <BrandMark />
        <ErrorState
          title={t('Drama unavailable', 'Drama không khả dụng')}
          message={failureMessage(playback.failure, locale)}
          retryLabel={sharedUiCopy.tryAgain[locale]}
          onRetry={() => void playback.load()}
        />
        <ActionButton label={t('Back to home', 'Về trang chủ')} variant="ghost" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  const drama = playback.drama;
  const scene = drama.currentScene;
  const consequence = scene.branch.state === 'committed' ? scene.branch.consequence : undefined;
  const choiceVisible = playback.playbackState.phase === 'choice' || playback.playbackState.phase === 'committing_choice';
  const consequenceVisible = playback.playbackState.phase === 'consequence' || playback.playbackState.phase === 'continuing';

  return (
    <Screen contentStyle={styles.playerScreen}>
      <View style={styles.topBar}>
        <BrandMark />
        <ActionButton label={t('My dramas', 'Drama của tôi')} variant="ghost" onPress={() => router.push('/library')} />
      </View>

      <MotionReveal key={`scene-${scene.id}-${scene.branch.state}`}>
        <DramaSceneStage
          sceneNumber={scene.number}
          title={scene.title}
          body={scene.script}
          characterName={drama.leadCharacter.name}
          mood={drama.mood}
          locale={locale}
          consequence={consequence}
          onPlaybackComplete={playback.markSceneComplete}
        />
      </MotionReveal>

      <View style={styles.playerBody}>
        {playback.failure ? (
          <ErrorState
            title={t('That action didn’t finish', 'Thao tác chưa hoàn tất')}
            message={failureMessage(playback.failure, locale)}
            retryLabel={sharedUiCopy.tryAgain[locale]}
            onRetry={playback.failure.source === 'commit_choice'
              ? () => void playback.commitChoice()
              : playback.failure.source === 'continue'
                ? () => void playback.continueDrama()
                : () => void playback.load()}
          />
        ) : null}

        {readOnly ? (
          <View style={styles.readOnlyDock}>
            <View style={styles.readOnlyHeader}>
              <Eyebrow>{t('Archived drama', 'Drama đã tạm dừng')}</Eyebrow>
              <Text style={styles.readOnlyStatus}>{t('READ ONLY', 'CHỈ ĐỌC')}</Text>
            </View>
            <Text style={styles.readOnlyTitle}>{t('Paused at this scene.', 'Tạm dừng tại cảnh này.')}</Text>
            <ActionButton label={t('Open drama library', 'Mở thư viện drama')} variant="secondary" onPress={() => router.push('/library')} />
          </View>
        ) : choiceVisible ? (
          <MotionReveal key={`choice-${scene.id}`}>
            <View style={styles.choiceSection}>
              <View style={styles.choiceHeading}>
                <Eyebrow>{t('Choose the next turn', 'Chọn bước ngoặt tiếp theo')}</Eyebrow>
                <Text style={styles.choiceTitle}>{t(`What should ${drama.leadCharacter.name} do next?`, `${drama.leadCharacter.name} nên làm gì tiếp theo?`)}</Text>
              </View>

              <View style={styles.choiceGrid}>
                {scene.choices.map((choice) => (
                  <DramaChoiceCard
                    key={choice.id}
                    choice={choice}
                    selected={choice.id === playback.selectedChoiceId}
                    disabled={playback.playbackState.phase === 'committing_choice'}
                    mood={drama.mood}
                    locale={locale}
                    onPress={() => playback.selectChoice(choice.id)}
                  />
                ))}
              </View>

              {!playback.selectedChoice ? (
                <Text style={styles.choiceHint}>{t('Pick a branch to continue the drama.', 'Chọn một nhánh để tiếp tục drama.')}</Text>
              ) : (
                <View style={styles.commitDock}>
                  <Text style={styles.commitText} numberOfLines={1}>{playback.selectedChoice.label}</Text>
                  <ActionButton
                    label={t('Lock this choice', 'Chốt lựa chọn')}
                    busy={playback.playbackState.phase === 'committing_choice'}
                    onPress={() => void playback.commitChoice()}
                  />
                </View>
              )}
            </View>
          </MotionReveal>
        ) : consequenceVisible ? (
          <MotionReveal key={`consequence-${scene.id}`}>
            <View style={styles.nextSection}>
              <Eyebrow>{t('Branch committed', 'Đã chốt nhánh')}</Eyebrow>
              <Text style={styles.nextTitle}>{t('The next scene starts from this exact consequence.', 'Cảnh tiếp theo bắt đầu chính từ hậu quả này.')}</Text>
              <ActionButton
                label={t(`Continue to scene ${scene.number + 1}`, `Tiếp tục cảnh ${scene.number + 1}`)}
                busy={playback.playbackState.phase === 'continuing'}
                onPress={() => void playback.continueDrama()}
              />
            </View>
          </MotionReveal>
        ) : null}

        <SceneVoiceCard key={scene.id} sceneId={scene.id} sceneText={scene.script} />

        <View style={styles.dramaUtilityRail}>
          <View style={styles.dramaUtilityCopy}>
            <Text style={styles.dramaUtilityKicker}>{playbackLabel(playback.playbackState.phase, locale)}</Text>
            <Text style={styles.dramaUtilityTitle} numberOfLines={2}>{drama.title}</Text>
            <Text style={styles.dramaUtilityMeta}>{drama.leadCharacter.name} · {moodLabel(drama.mood, locale)}</Text>
          </View>
          <View style={styles.dramaActions}>
            <ActionButton
              label={t('Share', 'Chia sẻ')}
              variant="ghost"
              onPress={() => void Share.share({ message: buildSpoilerSafeDramaShareText({ title: drama.title, sceneNumber: scene.number, premise: drama.premise, uiLocale: locale }) })}
            />
            <ActionButton label={t('History', 'Lịch sử')} variant="ghost" onPress={() => router.push({ pathname: '/library/history', params: { dramaId: drama.id } })} />
          </View>
        </View>
      </View>
    </Screen>
  );
}

function playbackLabel(phase: string, locale: 'en' | 'vi'): string {
  if (locale === 'vi') {
    if (phase === 'playing') return 'ĐANG PHÁT CẢNH';
    if (phase === 'choice' || phase === 'committing_choice') return 'ĐIỂM QUYẾT ĐỊNH';
    if (phase === 'continuing') return 'ĐANG DỰNG CẢNH TIẾP';
    return 'NHÁNH ĐÃ CHỐT';
  }
  if (phase === 'playing') return 'SCENE PLAYING';
  if (phase === 'choice' || phase === 'committing_choice') return 'DECISION POINT';
  if (phase === 'continuing') return 'BUILDING NEXT SCENE';
  return 'BRANCH COMMITTED';
}

function moodLabel(mood: DramaMood, locale: 'en' | 'vi'): string {
  const labels = locale === 'vi'
    ? { tense: 'Căng thẳng', romantic: 'Lãng mạn', mysterious: 'Bí ẩn', hopeful: 'Hy vọng' }
    : { tense: 'Tense', romantic: 'Romantic', mysterious: 'Mysterious', hopeful: 'Hopeful' };
  return labels[mood];
}

function readParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return value?.trim() || null;
}

function failureMessage(failure: DramaFailure | null, locale: 'en' | 'vi'): string {
  const vi = locale === 'vi';
  if (!failure) return vi ? 'Không thể tải drama này.' : 'This drama could not be loaded.';
  if (failure.code === 'choice_conflict') return vi ? 'Một lựa chọn khác đã là nhánh chuẩn của cảnh này. Drama đã được đồng bộ lại.' : 'A different choice is already canonical for this scene. The drama has been resynced.';
  if (failure.code === 'choice_required') return vi ? 'Cần chốt một lựa chọn trước khi dựng cảnh tiếp theo.' : 'Commit a choice before continuing to the next scene.';
  if (failure.code === 'not_found') return vi ? 'Drama hoặc lựa chọn này không còn khớp trạng thái chuẩn.' : 'This drama or choice no longer matches canonical state.';
  if (failure.code === 'auth_required') return vi ? 'Đăng nhập lại trước khi tiếp tục drama.' : 'Sign in again before continuing this drama.';
  if (failure.code === 'quota_exceeded') return vi ? 'Bạn đã dùng hết lượt tạo cảnh hôm nay. Hạn mức đặt lại lúc 00:00 UTC.' : 'Today’s scene-generation allowance is exhausted. It resets at 00:00 UTC.';
  if (failure.code === 'provider_unavailable') return vi ? 'Tạo drama tạm thời không khả dụng. Nhánh đã chốt vẫn được giữ nguyên.' : 'Drama generation is temporarily unavailable. Your committed branch is unchanged.';
  if (failure.code === 'invalid_generation') return vi ? 'Cảnh được tạo không đạt hợp đồng drama chuẩn. Trạng thái hiện tại vẫn được giữ nguyên để bạn thử lại.' : 'The generated scene did not satisfy the canonical drama contract. Current state is unchanged so you can retry.';
  return vi ? 'Thao tác chưa hoàn tất. Trạng thái chuẩn vẫn được giữ nguyên.' : 'The action did not finish. Canonical state is unchanged.';
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
  dramaUtilityRail: {
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
  },
  dramaUtilityCopy: { gap: 4 },
  dramaUtilityKicker: { color: colors.accentStrong, fontFamily: typography.mono, fontSize: 9, fontWeight: '900', letterSpacing: 1.1, textTransform: 'uppercase' },
  dramaUtilityTitle: { color: colors.ink, fontFamily: typography.display, fontSize: 22, lineHeight: 27, fontWeight: '700' },
  dramaUtilityMeta: { color: colors.quietInk, fontFamily: typography.mono, fontSize: 9, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  dramaActions: {
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
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  choiceGrid: {
    gap: spacing.xs,
  },
  choiceHint: {
    color: colors.quietInk,
    fontFamily: typography.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  commitDock: {
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accentSoft,
    backgroundColor: colors.surfaceWarmDeep,
  },
  commitText: {
    color: colors.ink,
    fontFamily: typography.display,
    fontSize: 15,
    lineHeight: 20,
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
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  readOnlyDock: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceQuiet,
  },
  readOnlyHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  readOnlyStatus: { color: colors.quietInk, fontFamily: typography.mono, fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  readOnlyTitle: {
    color: colors.ink,
    fontFamily: typography.display,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
  },
});
