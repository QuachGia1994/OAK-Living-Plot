import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { sharedUiCopy, useUiCopy } from '@/features/localization/ui-copy';
import type { StoryHistoryItem, StoryHistorySnapshot } from '@/features/story/contracts';
import { useStoryExperienceClient } from '@/features/story/story-client-context';
import { DramaEmptyStage, DramaLoadingStage, DramaRecapFrame, DramaUtilityHero } from '@/ui/drama-visuals';
import { ActionButton, BrandMark, ErrorState, Pill, Screen } from '@/ui/primitives';
import { colors, spacing, typography } from '@/ui/theme';

export default function StoryHistoryScreen() {
  const router = useRouter();
  const { locale, t } = useUiCopy();
  const params = useLocalSearchParams<{ plotId?: string | string[] }>();
  const plotId = useMemo(() => readParam(params.plotId), [params.plotId]);
  const client = useStoryExperienceClient();
  const [history, setHistory] = useState<StoryHistorySnapshot | null>(null);
  const [error, setError] = useState<string | null>(plotId ? null : t('This history link is missing its plot identifier.', 'Liên kết lịch sử thiếu mã cốt truyện.'));

  const load = useCallback(async () => {
    if (!plotId) {
      setError(t('This history link is missing its plot identifier.', 'Liên kết lịch sử thiếu mã cốt truyện.'));
      return;
    }
    setError(null);
    try {
      setHistory(await client.loadHistory(plotId));
    } catch {
      setError(t('Canonical story history could not be loaded.', 'Không thể tải lịch sử câu chuyện chuẩn.'));
    }
  }, [client, plotId, t]);

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
        if (active) setError(t('Canonical story history could not be loaded.', 'Không thể tải lịch sử câu chuyện chuẩn.'));
      });
    return () => { active = false; };
  }, [client, plotId, t]);

  return (
    <Screen>
      <View style={styles.topBar}>
        <BrandMark />
        <ActionButton
          label={t('Back to story', 'Quay lại câu chuyện')}
          variant="ghost"
          onPress={() => plotId ? router.replace({ pathname: '/story', params: { plotId } }) : router.replace('/')}
        />
      </View>

      <DramaUtilityHero
        kicker={t('PREVIOUSLY ON LIVING PLOT', 'TRƯỚC ĐÓ TRÊN LIVING PLOT')}
        title={history?.title ?? t('Story so far', 'Câu chuyện đến đây')}
        detail={history ? t(`${history.items.length} scenes preserved in canonical order.`, `${history.items.length} cảnh được giữ theo thứ tự chuẩn.`) : t('Rebuilding the chain of choices that brought you here.', 'Đang dựng lại chuỗi lựa chọn đã đưa câu chuyện tới đây.')}
        mood="mysterious"
        characterName="Recap"
      />

      {error ? <ErrorState title={t('Recap unavailable', 'Tóm tắt không khả dụng')} message={error} retryLabel={sharedUiCopy.tryAgain[locale]} onRetry={() => void load()} /> : null}
      {!history && !error ? (
        <DramaLoadingStage
          label={t('Building your story recap…', 'Đang dựng lại tóm tắt câu chuyện…')}
          detail={t('Restoring each episode, locked choice and consequence.', 'Đang khôi phục từng tập, lựa chọn đã chốt và hậu quả.')}
          locale={locale}
        />
      ) : null}

      {history && history.items.length === 0 ? (
        <View style={styles.emptyState}>
          <DramaEmptyStage
            title={t('No recap scenes yet.', 'Chưa có cảnh tóm tắt.')}
            detail={t('Play the first episode and your locked decisions will appear here.', 'Xem tập đầu và các quyết định đã chốt sẽ xuất hiện ở đây.')}
            locale={locale}
          />
          <ActionButton
            label={t('Back to story', 'Quay lại câu chuyện')}
            variant="secondary"
            onPress={() => plotId ? router.replace({ pathname: '/story', params: { plotId } }) : router.replace('/')}
          />
        </View>
      ) : null}

      {history && history.items.length > 0 ? (
        <>
          <BranchJourney items={history.items} locale={locale} />
          <View style={styles.timeline}>
          <View style={styles.timelineRail} />
          {history.items.map((item, index) => {
            const locked = item.status === 'choice_committed';
            return (
              <View key={item.episodeId} style={styles.timelineItem}>
                <View style={styles.timelineMarkerColumn}>
                  <View style={[styles.timelineNode, locked && styles.timelineNodeLocked]}>
                    <Text style={[styles.timelineNodeText, locked && styles.timelineNodeTextLocked]}>{String(index + 1).padStart(2, '0')}</Text>
                  </View>
                </View>
                <View style={styles.timelineContent}>
                  <View style={styles.itemHeader}>
                    <Pill tone={locked ? 'success' : 'accent'}>{locked ? t('LOCKED', 'ĐÃ CHỐT') : t('NOW', 'HIỆN TẠI')}</Pill>
                    <Text style={styles.itemMeta}>{locale === 'vi' ? 'TẬP' : 'EP'} {String(item.episodeNumber).padStart(2, '0')}</Text>
                  </View>
                  <DramaRecapFrame
                    episodeNumber={item.episodeNumber}
                    title={item.title}
                    summary={item.summary}
                    choiceLabel={item.choiceLabel ? t(`Choice ${item.choiceKey}: ${item.choiceLabel}`, `Lựa chọn ${item.choiceKey}: ${item.choiceLabel}`) : undefined}
                    consequence={item.consequence}
                    pendingLabel={t('Your next choice is still waiting inside this scene.', 'Lựa chọn tiếp theo vẫn đang chờ trong cảnh này.')}
                    locale={locale}
                  />
                </View>
              </View>
            );
          })}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

function BranchJourney({ items, locale }: { items: StoryHistoryItem[]; locale: 'en' | 'vi' }) {
  const current = items[items.length - 1];
  return (
    <View style={styles.branchMap}>
      <View style={styles.branchHeader}>
        <Text style={styles.branchKicker}>{locale === 'vi' ? 'BẢN ĐỒ NHÁNH' : 'BRANCH MAP'}</Text>
        <Text style={styles.branchMeta}>{items.length} {locale === 'vi' ? 'CẢNH' : 'SCENES'}</Text>
      </View>
      <View style={styles.branchPath}>
        {items.map((item, index) => (
          <View key={item.episodeId} style={styles.branchStep}>
            <View style={[styles.branchNode, item.status === 'choice_committed' && styles.branchNodeLocked]}>
              <Text style={styles.branchNodeText}>{String(item.episodeNumber).padStart(2, '0')}</Text>
            </View>
            {item.choiceKey ? <Text style={styles.branchChoice}>{item.choiceKey}</Text> : null}
            {index < items.length - 1 ? <View style={styles.branchConnector} /> : null}
          </View>
        ))}
      </View>
      {current?.status === 'awaiting_choice' ? (
        <View style={styles.branchFuture}>
          <Text style={styles.branchFutureLabel}>{locale === 'vi' ? 'LỰA CHỌN TIẾP THEO' : 'NEXT TURN'}</Text>
          <View style={styles.branchFutureChoices}>
            {['A', 'B', 'C'].map((key) => <View key={key} style={styles.branchGhost}><Text style={styles.branchGhostText}>{key}</Text></View>)}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function readParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return value?.trim() || null;
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  emptyState: { gap: spacing.md },
  branchMap: { gap: spacing.md, padding: spacing.md, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, backgroundColor: colors.surfaceQuiet },
  branchHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  branchKicker: { color: colors.accentStrong, fontFamily: typography.mono, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  branchMeta: { color: colors.quietInk, fontFamily: typography.mono, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  branchPath: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  branchStep: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  branchNode: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, borderWidth: 1, borderColor: colors.accentSoft, backgroundColor: colors.background },
  branchNodeLocked: { borderColor: colors.success, backgroundColor: colors.surfaceSuccess },
  branchNodeText: { color: colors.ink, fontFamily: typography.mono, fontSize: 10, fontWeight: '900' },
  branchChoice: { color: colors.accentStrong, fontFamily: typography.mono, fontSize: 11, fontWeight: '900' },
  branchConnector: { width: 28, height: 1, backgroundColor: colors.borderStrong },
  branchFuture: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle },
  branchFutureLabel: { color: colors.quietInk, fontFamily: typography.mono, fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  branchFutureChoices: { flexDirection: 'row', gap: spacing.xs },
  branchGhost: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.accentSoft, backgroundColor: colors.surfaceWarmDeep },
  branchGhostText: { color: colors.accentStrong, fontFamily: typography.mono, fontSize: 9, fontWeight: '900' },
  timeline: { position: 'relative', gap: spacing.lg, paddingTop: spacing.sm },
  timelineRail: { position: 'absolute', top: spacing.md, bottom: spacing.xl, left: 17, width: 1, backgroundColor: colors.borderStrong },
  timelineItem: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  timelineMarkerColumn: { width: 36, alignItems: 'center', paddingTop: 2 },
  timelineNode: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.accentSoft, backgroundColor: colors.background },
  timelineNodeLocked: { borderColor: colors.borderSuccess, backgroundColor: colors.surfaceSuccess },
  timelineNodeText: { color: colors.accentStrong, fontFamily: typography.mono, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  timelineNodeTextLocked: { color: colors.success },
  timelineContent: { flex: 1, gap: spacing.sm, minWidth: 0 },
  itemHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  itemMeta: { color: colors.quietInk, fontFamily: typography.mono, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
});
