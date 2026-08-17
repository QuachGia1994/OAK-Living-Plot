import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { sharedUiCopy, useUiCopy } from '@/features/localization/ui-copy';
import type { StoryLibrarySnapshot, StoryPlotSummary } from '@/features/story/contracts';
import { useStoryExperienceClient } from '@/features/story/story-client-context';
import { ActionButton, BrandMark, ErrorState, Eyebrow, LoadingState, Pill, Screen } from '@/ui/primitives';
import { colors, spacing, typography } from '@/ui/theme';

export default function StoryLibraryScreen() {
  const router = useRouter();
  const { locale, t } = useUiCopy();
  const client = useStoryExperienceClient();
  const [snapshot, setSnapshot] = useState<StoryLibrarySnapshot | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSnapshot(await client.loadLibrary());
    } catch {
      setError(t('Your story library could not be loaded. Canonical plot state is unchanged.', 'Không thể tải thư viện câu chuyện. Trạng thái cốt truyện chuẩn không thay đổi.'));
    }
  }, [client, t]);

  useEffect(() => {
    let active = true;
    void client.loadLibrary()
      .then((next) => {
        if (!active) return;
        setSnapshot(next);
        setError(null);
      })
      .catch(() => {
        if (active) setError(t('Your story library could not be loaded. Canonical plot state is unchanged.', 'Không thể tải thư viện câu chuyện. Trạng thái cốt truyện chuẩn không thay đổi.'));
      });
    return () => { active = false; };
  }, [client, t]);

  async function change(plot: StoryPlotSummary, action: 'archive' | 'restore') {
    setBusyId(plot.id);
    setError(null);
    try {
      if (action === 'archive') await client.archivePlot(plot.id);
      else await client.restorePlot(plot.id);
      await load();
    } catch {
      setError(action === 'archive' ? t('This plot could not be paused.', 'Không thể tạm dừng cốt truyện này.') : t('This plot could not be restored.', 'Không thể khôi phục cốt truyện này.'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Screen>
      <View style={styles.topBar}>
        <BrandMark />
        <ActionButton label={sharedUiCopy.home[locale]} variant="ghost" onPress={() => router.replace('/')} />
      </View>
      <View style={styles.hero}>
        <Eyebrow>{t('My stories', 'Câu chuyện của tôi')}</Eyebrow>
        <Text style={styles.title}>{t('Every plot you’ve started.', 'Mọi cốt truyện bạn đã bắt đầu.')}</Text>
        <Text style={styles.body}>{t('Keep current dramas active, or pause older ones and bring them back whenever you want.', 'Giữ drama hiện tại hoạt động, hoặc tạm dừng chuyện cũ và khôi phục bất cứ lúc nào.')}</Text>
      </View>

      {error ? <ErrorState title={t('My Stories could not update', 'Không thể cập nhật Câu chuyện của tôi')} message={error} retryLabel={sharedUiCopy.tryAgain[locale]} onRetry={() => void load()} /> : null}
      {!snapshot && !error ? <LoadingState label={t('Opening My Stories…', 'Đang mở Câu chuyện của tôi…')} /> : null}

      {snapshot ? (
        <>
          <LibrarySection
            title={t('Active', 'Đang hoạt động')}
            plots={snapshot.active}
            empty={t('No active plots yet.', 'Chưa có cốt truyện hoạt động.')}
            action="archive"
            busyId={busyId}
            t={t}
            onOpen={(plot) => router.push({ pathname: '/story', params: { plotId: plot.id } })}
            onChange={change}
          />
          <LibrarySection
            title={t('Paused', 'Đã tạm dừng')}
            plots={snapshot.archived}
            empty={t('No paused stories.', 'Không có câu chuyện tạm dừng.')}
            action="restore"
            busyId={busyId}
            t={t}
            onOpen={(plot) => router.push({ pathname: '/story', params: { plotId: plot.id, readOnly: '1' } })}
            onChange={change}
          />
        </>
      ) : null}
    </Screen>
  );
}

type Translate = (en: string, vi: string) => string;

function LibrarySection({
  title,
  plots,
  empty,
  action,
  busyId,
  t,
  onOpen,
  onChange,
}: {
  title: string;
  plots: StoryPlotSummary[];
  empty: string;
  action: 'archive' | 'restore';
  busyId: string | null;
  t: Translate;
  onOpen: (plot: StoryPlotSummary) => void;
  onChange: (plot: StoryPlotSummary, action: 'archive' | 'restore') => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Pill>{plots.length}</Pill>
      </View>
      {plots.length === 0 ? <View style={styles.emptyState}><Text style={styles.body}>{empty}</Text></View> : null}
      {plots.map((plot) => (
        <View key={plot.id} style={styles.plotRow}>
          <View style={styles.plotHeader}>
            <Pill tone={plot.status === 'awaiting_choice' ? 'accent' : 'success'}>EP {plot.episodeNumber}</Pill>
            <Text style={styles.meta}>{plot.updatedLabel}</Text>
          </View>
          <Text style={styles.plotTitle}>{plot.title}</Text>
          <Text style={styles.body} numberOfLines={2}>{plot.resumeLine}</Text>
          <View style={styles.actions}>
            <View style={styles.actionGrow}><ActionButton label={action === 'archive' ? t('Continue', 'Tiếp tục') : t('Read latest', 'Đọc tập mới nhất')} variant="secondary" onPress={() => onOpen(plot)} /></View>
            <View style={styles.actionGrow}>
              <ActionButton
                label={action === 'archive' ? t('Pause', 'Tạm dừng') : t('Restore', 'Khôi phục')}
                variant="ghost"
                busy={busyId === plot.id}
                disabled={busyId !== null && busyId !== plot.id}
                onPress={() => onChange(plot, action)}
              />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hero: { gap: spacing.sm, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { color: colors.ink, fontFamily: typography.display, fontSize: 38, lineHeight: 44, fontWeight: '700', letterSpacing: -1 },
  body: { color: colors.inkMuted, fontSize: 14, lineHeight: 21 },
  section: { gap: spacing.sm, paddingTop: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderStrong },
  sectionTitle: { color: colors.ink, fontFamily: typography.display, fontSize: 26, lineHeight: 32, fontWeight: '700' },
  emptyState: { paddingVertical: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
  plotRow: { gap: spacing.sm, paddingVertical: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderStrong },
  plotHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  plotTitle: { color: colors.ink, fontFamily: typography.display, fontSize: 24, lineHeight: 29, fontWeight: '700' },
  meta: { color: colors.inkMuted, fontFamily: typography.mono, fontSize: 10, letterSpacing: 0.5 },
  actions: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.xs },
  actionGrow: { flex: 1 },
});
