import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { sharedUiCopy, useUiCopy } from '@/features/localization/ui-copy';
import type { StoryLibrarySnapshot, StoryPlotSummary } from '@/features/story/contracts';
import { useStoryExperienceClient } from '@/features/story/story-client-context';
import { DramaNavigationDock } from '@/ui/drama-navigation';
import { DramaCoverTile, DramaEmptyStage, DramaLoadingStage } from '@/ui/drama-visuals';
import { ActionButton, BrandMark, ErrorState, Eyebrow, Screen } from '@/ui/primitives';
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
      setError(action === 'archive'
        ? t('This plot could not be paused.', 'Không thể tạm dừng cốt truyện này.')
        : t('This plot could not be restored.', 'Không thể khôi phục cốt truyện này.'));
    } finally {
      setBusyId(null);
    }
  }

  const emptyLibrary = Boolean(snapshot && snapshot.active.length === 0 && snapshot.archived.length === 0);

  return (
    <Screen>
      <View style={styles.topBar}>
        <BrandMark />
      </View>

      <View style={styles.hero}>
        <Eyebrow>{t('My drama shelf', 'Kệ drama của tôi')}</Eyebrow>
        <Text style={styles.title}>{t('Every story has a face.', 'Mỗi câu chuyện đều có một gương mặt.')}</Text>
        <Text style={styles.body}>{t('Continue the scene that is calling you back.', 'Tiếp tục cảnh đang gọi bạn quay lại.')}</Text>
      </View>

      <DramaNavigationDock
        active="library"
        locale={locale}
        onNavigate={(destination) => {
          if (destination === 'library') return;
          router.replace(destination === 'home' ? '/' : destination === 'create' ? '/create' : '/settings');
        }}
      />

      {error ? (
        <ErrorState
          title={t('My Stories could not update', 'Không thể cập nhật Câu chuyện của tôi')}
          message={error}
          retryLabel={sharedUiCopy.tryAgain[locale]}
          onRetry={() => void load()}
        />
      ) : null}

      {!snapshot && !error ? (
        <DramaLoadingStage
          label={t('Lighting your story shelf…', 'Đang thắp sáng kệ câu chuyện…')}
          detail={t('Restoring covers, episode positions and your next decision points.', 'Đang dựng lại bìa, vị trí tập và điểm quyết định tiếp theo.')}
          locale={locale}
        />
      ) : null}

      {emptyLibrary ? (
        <View style={styles.emptyWrap}>
          <DramaEmptyStage
            title={t('No drama is playing yet.', 'Chưa có drama nào đang phát.')}
            detail={t('Give Living Plot one spark and your first cover will appear here.', 'Cho Living Plot một tia lửa và bìa câu chuyện đầu tiên sẽ xuất hiện ở đây.')}
            locale={locale}
          />
          <ActionButton label={t('Create my first drama', 'Tạo drama đầu tiên')} onPress={() => router.push('/create')} />
        </View>
      ) : null}

      {snapshot && !emptyLibrary ? (
        <>
          <LibrarySection
            title={t('Now playing', 'Đang phát')}
            subtitle={t('Tap a cover to step back into the scene.', 'Chạm bìa để quay lại cảnh đang diễn ra.')}
            plots={snapshot.active}
            action="archive"
            busyId={busyId}
            t={t}
            onOpen={(plot) => router.push({ pathname: '/story', params: { plotId: plot.id } })}
            onChange={change}
          />
          {snapshot.archived.length > 0 ? (
            <LibrarySection
              title={t('Paused', 'Đã tạm dừng')}
              subtitle={t('Older stories stay on the shelf until you restore them.', 'Câu chuyện cũ vẫn nằm trên kệ cho đến khi bạn khôi phục.')}
              plots={snapshot.archived}
              action="restore"
              busyId={busyId}
              t={t}
              onOpen={(plot) => router.push({ pathname: '/story', params: { plotId: plot.id, readOnly: '1' } })}
              onChange={change}
            />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

type Translate = (en: string, vi: string) => string;

function LibrarySection({
  title,
  subtitle,
  plots,
  action,
  busyId,
  t,
  onOpen,
  onChange,
}: {
  title: string;
  subtitle: string;
  plots: StoryPlotSummary[];
  action: 'archive' | 'restore';
  busyId: string | null;
  t: Translate;
  onOpen: (plot: StoryPlotSummary) => void;
  onChange: (plot: StoryPlotSummary, action: 'archive' | 'restore') => void;
}) {
  if (plots.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionCopy}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        </View>
        <Text style={styles.sectionCount}>{String(plots.length).padStart(2, '0')}</Text>
      </View>

      <View style={styles.coverGrid}>
        {plots.map((plot) => {
          const awaitingChoice = plot.status === 'awaiting_choice';
          const status = awaitingChoice
            ? t('Your choice is waiting', 'Đang chờ lựa chọn của bạn')
            : t('Next scene ready', 'Cảnh tiếp theo đã sẵn sàng');
          return (
            <View key={plot.id} style={styles.coverItem}>
              <DramaCoverTile
                title={plot.title}
                premise={plot.resumeLine || plot.premise}
                characterName={plot.characterName}
                mood={plot.mood}
                episodeLabel={`${t('EP', 'TẬP')} ${String(plot.episodeNumber).padStart(2, '0')}`}
                statusLabel={status}
                subdued={action === 'restore'}
                onPress={() => onOpen(plot)}
              />
              <View style={styles.coverFooter}>
                <Text style={styles.updated}>{plot.updatedLabel}</Text>
                <ActionButton
                  label={action === 'archive' ? t('Pause', 'Tạm dừng') : t('Restore', 'Khôi phục')}
                  variant="ghost"
                  busy={busyId === plot.id}
                  disabled={busyId !== null && busyId !== plot.id}
                  onPress={() => onChange(plot, action)}
                  style={styles.coverAction}
                />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hero: { gap: spacing.xs, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { color: colors.ink, fontFamily: typography.display, fontSize: 38, lineHeight: 43, fontWeight: '700', letterSpacing: -1 },
  body: { color: colors.inkMuted, fontSize: 14, lineHeight: 20 },
  emptyWrap: { gap: spacing.md },
  section: { gap: spacing.md, paddingTop: spacing.xl },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderStrong,
  },
  sectionCopy: { flex: 1, gap: 3 },
  sectionTitle: { color: colors.ink, fontFamily: typography.display, fontSize: 27, lineHeight: 31, fontWeight: '700' },
  sectionSubtitle: { color: colors.inkMuted, fontSize: 11, lineHeight: 16 },
  sectionCount: { color: colors.accentStrong, fontFamily: typography.mono, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  coverGrid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: spacing.sm },
  coverItem: { minWidth: 148, flexGrow: 1, flexBasis: '46%', gap: spacing.xs },
  coverFooter: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  updated: { flex: 1, color: colors.quietInk, fontFamily: typography.mono, fontSize: 8, lineHeight: 13, letterSpacing: 0.4 },
  coverAction: { minHeight: 40, paddingHorizontal: spacing.sm },
});
