import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useDramaExperienceClient } from '@/features/drama/drama-client-context';
import { sharedUiCopy, useUiCopy } from '@/features/localization/ui-copy';
import type { DramaHistory, DramaHistoryItem } from '@/features/drama/contracts';
import { journeyStats } from '@/features/drama/journey-stats';
import { DramaEmptyStage, DramaLoadingStage, DramaRecapFrame, DramaUtilityHero } from '@/ui/drama-visuals';
import { ActionButton, BrandMark, ErrorState, Pill, Screen } from '@/ui/primitives';
import { colors, spacing, typography } from '@/ui/theme';

export default function DramaHistoryScreen() {
  const router = useRouter();
  const { locale, t } = useUiCopy();
  const params = useLocalSearchParams<{ dramaId?: string | string[] }>();
  const dramaId = useMemo(() => readParam(params.dramaId), [params.dramaId]);
  const client = useDramaExperienceClient();
  const [history, setHistory] = useState<DramaHistory | null>(null);
  const [error, setError] = useState<string | null>(dramaId ? null : t('This history link is missing its drama identifier.', 'Liên kết lịch sử thiếu mã drama.'));

  const load = useCallback(async () => {
    if (!dramaId) {
      setError(t('This history link is missing its drama identifier.', 'Liên kết lịch sử thiếu mã drama.'));
      return;
    }
    setError(null);
    try {
      setHistory(await client.loadHistory(dramaId));
    } catch {
      setError(t('Canonical drama history could not be loaded.', 'Không thể tải lịch sử drama chuẩn.'));
    }
  }, [client, dramaId, t]);

  useEffect(() => {
    if (!dramaId) return;
    let active = true;
    void client.loadHistory(dramaId)
      .then((next) => {
        if (!active) return;
        setHistory(next);
        setError(null);
      })
      .catch(() => {
        if (active) setError(t('Canonical drama history could not be loaded.', 'Không thể tải lịch sử drama chuẩn.'));
      });
    return () => { active = false; };
  }, [client, dramaId, t]);

  const backToDrama = () => dramaId ? router.replace({ pathname: '/library/drama', params: { dramaId } }) : router.replace('/');

  return (
    <Screen>
      <View style={styles.topBar}>
        <BrandMark />
        <ActionButton label={t('Back to drama', 'Quay lại drama')} variant="ghost" onPress={backToDrama} />
      </View>

      <DramaUtilityHero
        kicker={t('PREVIOUSLY ON LIVING PLOT', 'TRƯỚC ĐÓ TRÊN LIVING PLOT')}
        title={history?.title ?? t('Drama so far', 'Drama đến đây')}
        detail={history ? t(`${history.items.length} scenes preserved in canonical order.`, `${history.items.length} cảnh được giữ theo thứ tự chuẩn.`) : t('Restoring the choices that brought this drama here.', 'Đang khôi phục các lựa chọn đã đưa drama tới đây.')}
        mood="mysterious"
        characterName="Recap"
      />

      {error ? <ErrorState title={t('Recap unavailable', 'Tóm tắt không khả dụng')} message={error} retryLabel={sharedUiCopy.tryAgain[locale]} onRetry={() => void load()} /> : null}
      {!history && !error ? <DramaLoadingStage label={t('Building your drama recap…', 'Đang dựng lại tóm tắt drama…')} detail={t('Restoring each scene, committed branch and consequence.', 'Đang khôi phục từng cảnh, nhánh đã chốt và hậu quả.')} locale={locale} /> : null}

      {history && history.items.length === 0 ? (
        <View style={styles.emptyState}>
          <DramaEmptyStage title={t('No recap scenes yet.', 'Chưa có cảnh tóm tắt.')} detail={t('Play the first scene and committed choices will appear here.', 'Xem cảnh đầu và các lựa chọn đã chốt sẽ xuất hiện ở đây.')} locale={locale} />
          <ActionButton label={t('Back to drama', 'Quay lại drama')} variant="secondary" onPress={backToDrama} />
        </View>
      ) : null}

      {history && history.items.length > 0 ? (
        <>
          <JourneyStatsStrip history={history} locale={locale} />
          <BranchJourney items={history.items} locale={locale} />
          <View style={styles.timeline}>
            <View style={styles.timelineRail} />
            {history.items.map((item, index) => {
              const committed = item.branchState === 'committed';
              return (
                <View key={item.sceneId} style={styles.timelineItem}>
                  <View style={styles.timelineMarkerColumn}>
                    <View style={[styles.timelineNode, committed && styles.timelineNodeLocked]}>
                      <Text style={[styles.timelineNodeText, committed && styles.timelineNodeTextLocked]}>{String(index + 1).padStart(2, '0')}</Text>
                    </View>
                  </View>
                  <View style={styles.timelineContent}>
                    <View style={styles.itemHeader}>
                      <Pill tone={committed ? 'success' : 'accent'}>{committed ? t('COMMITTED', 'ĐÃ CHỐT') : t('CURRENT', 'HIỆN TẠI')}</Pill>
                      <Text style={styles.itemMeta}>{t('SCENE', 'CẢNH')} {String(item.sceneNumber).padStart(2, '0')}</Text>
                    </View>
                    <DramaRecapFrame
                      sceneNumber={item.sceneNumber}
                      title={item.title}
                      summary={item.summary}
                      choiceLabel={item.choiceLabel ? t(`Choice ${item.choiceKey}: ${item.choiceLabel}`, `Lựa chọn ${item.choiceKey}: ${item.choiceLabel}`) : undefined}
                      consequence={item.consequence}
                      pendingLabel={t('The next choice is still waiting inside this scene.', 'Lựa chọn tiếp theo vẫn đang chờ trong cảnh này.')}
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

function JourneyStatsStrip({ history, locale }: { history: DramaHistory; locale: 'en' | 'vi' }) {
  const stats = journeyStats(history);
  const labels = locale === 'vi'
    ? { scenes: 'Cảnh đã đi', choices: 'Nhánh đã chốt', furthest: 'Cảnh xa nhất' }
    : { scenes: 'Scenes traveled', choices: 'Choices locked', furthest: 'Furthest scene' };
  return (
    <View style={styles.statsStrip}>
      <JourneyMetric label={labels.scenes} value={String(stats.scenes)} />
      <JourneyMetric label={labels.choices} value={String(stats.committedChoices)} />
      <JourneyMetric label={labels.furthest} value={String(stats.furthestScene).padStart(2, '0')} />
    </View>
  );
}

function JourneyMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statMetric}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function BranchJourney({ items, locale }: { items: DramaHistoryItem[]; locale: 'en' | 'vi' }) {
  const current = items[items.length - 1];
  return (
    <View style={styles.branchMap}>
      <View style={styles.branchHeader}>
        <Text style={styles.branchKicker}>{locale === 'vi' ? 'BẢN ĐỒ NHÁNH' : 'BRANCH MAP'}</Text>
        <Text style={styles.branchMeta}>{items.length} {locale === 'vi' ? 'CẢNH' : 'SCENES'}</Text>
      </View>
      <View style={styles.branchPath}>
        {items.map((item, index) => (
          <View key={item.sceneId} style={styles.branchStep}>
            <View style={[styles.branchNode, item.branchState === 'committed' && styles.branchNodeLocked]}>
              <Text style={styles.branchNodeText}>{String(item.sceneNumber).padStart(2, '0')}</Text>
            </View>
            {item.choiceKey ? <Text style={styles.branchChoice}>{item.choiceKey}</Text> : null}
            {index < items.length - 1 ? <View style={styles.branchConnector} /> : null}
          </View>
        ))}
      </View>
      {current?.branchState === 'open' ? (
        <View style={styles.branchFuture}>
          <Text style={styles.branchFutureLabel}>{locale === 'vi' ? 'LỰA CHỌN TIẾP THEO' : 'NEXT CHOICE'}</Text>
          <View style={styles.branchFutureChoices}>{['A', 'B', 'C'].map((key) => <View key={key} style={styles.branchGhost}><Text style={styles.branchGhostText}>{key}</Text></View>)}</View>
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
  statsStrip: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  statMetric: { minWidth: 104, flex: 1, gap: 3, paddingHorizontal: spacing.sm, paddingVertical: spacing.md },
  statValue: { color: colors.accentStrong, fontFamily: typography.display, fontSize: 24, lineHeight: 27, fontWeight: '700' },
  statLabel: { color: colors.quietInk, fontFamily: typography.mono, fontSize: 8, lineHeight: 13, fontWeight: '900', letterSpacing: 0.55, textTransform: 'uppercase' },
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
