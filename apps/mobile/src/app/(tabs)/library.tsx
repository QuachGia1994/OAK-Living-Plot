import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useDramaExperienceClient } from '@/features/drama/drama-client-context';
import { sharedUiCopy, useUiCopy } from '@/features/localization/ui-copy';
import type { DramaLibrarySnapshot, DramaSummary } from '@/features/drama/contracts';
import { DramaCoverTile, DramaEmptyStage, DramaLoadingStage } from '@/ui/drama-visuals';
import { ActionButton, BrandMark, ErrorState, Eyebrow, Screen } from '@/ui/primitives';
import { colors, spacing, typography } from '@/ui/theme';

export default function DramaLibraryScreen() {
  const router = useRouter();
  const { locale, t } = useUiCopy();
  const client = useDramaExperienceClient();
  const [snapshot, setSnapshot] = useState<DramaLibrarySnapshot | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSnapshot(await client.loadLibrary());
    } catch {
      setError(t('Your drama library could not be loaded. Canonical state is unchanged.', 'Không thể tải thư viện drama. Trạng thái chuẩn không thay đổi.'));
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
        if (active) setError(t('Your drama library could not be loaded. Canonical state is unchanged.', 'Không thể tải thư viện drama. Trạng thái chuẩn không thay đổi.'));
      });
    return () => { active = false; };
  }, [client, t]);

  async function change(drama: DramaSummary, action: 'archive' | 'restore') {
    setBusyId(drama.id);
    setError(null);
    try {
      if (action === 'archive') await client.archiveDrama(drama.id);
      else await client.restoreDrama(drama.id);
      await load();
    } catch {
      setError(action === 'archive' ? t('This drama could not be paused.', 'Không thể tạm dừng drama này.') : t('This drama could not be restored.', 'Không thể khôi phục drama này.'));
    } finally {
      setBusyId(null);
    }
  }

  const emptyLibrary = Boolean(snapshot && snapshot.active.length === 0 && snapshot.archived.length === 0);

  return (
    <Screen>
      <View style={styles.topBar}><BrandMark /></View>
      <View style={styles.hero}>
        <Eyebrow>{t('My drama shelf', 'Kệ drama của tôi')}</Eyebrow>
        <Text style={styles.title}>{t('Every drama has a face.', 'Mỗi drama đều có một gương mặt.')}</Text>
        <Text style={styles.body}>{t('Continue the scene that is calling you back.', 'Tiếp tục cảnh đang gọi bạn quay lại.')}</Text>
      </View>

      {error ? <ErrorState title={t('Drama shelf could not update', 'Không thể cập nhật kệ drama')} message={error} retryLabel={sharedUiCopy.tryAgain[locale]} onRetry={() => void load()} /> : null}
      {!snapshot && !error ? <DramaLoadingStage label={t('Lighting your drama shelf…', 'Đang thắp sáng kệ drama…')} detail={t('Restoring covers, scene positions and decision points.', 'Đang khôi phục bìa, vị trí cảnh và điểm quyết định.')} locale={locale} /> : null}

      {emptyLibrary ? (
        <View style={styles.emptyWrap}>
          <DramaEmptyStage title={t('No drama is playing yet.', 'Chưa có drama nào đang phát.')} detail={t('Give Living Plot one spark and your first drama will appear here.', 'Cho Living Plot một tia lửa và drama đầu tiên sẽ xuất hiện ở đây.')} locale={locale} />
          <ActionButton label={t('Create my first drama', 'Tạo drama đầu tiên')} onPress={() => router.push('/create')} />
        </View>
      ) : null}

      {snapshot && !emptyLibrary ? (
        <>
          <LibrarySection
            title={t('Now playing', 'Đang phát')}
            subtitle={t('Tap a cover to return to the current scene.', 'Chạm bìa để quay lại cảnh hiện tại.')}
            dramas={snapshot.active}
            action="archive"
            busyId={busyId}
            t={t}
            onOpen={(drama) => router.push({ pathname: '/drama', params: { dramaId: drama.id } })}
            onChange={change}
          />
          {snapshot.archived.length > 0 ? (
            <LibrarySection
              title={t('Paused', 'Đã tạm dừng')}
              subtitle={t('Paused dramas stay here until you restore them.', 'Drama đã tạm dừng vẫn ở đây cho đến khi bạn khôi phục.')}
              dramas={snapshot.archived}
              action="restore"
              busyId={busyId}
              t={t}
              onOpen={(drama) => router.push({ pathname: '/drama', params: { dramaId: drama.id, readOnly: '1' } })}
              onChange={change}
            />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

type Translate = (en: string, vi: string) => string;

function LibrarySection({ title, subtitle, dramas, action, busyId, t, onOpen, onChange }: {
  title: string;
  subtitle: string;
  dramas: DramaSummary[];
  action: 'archive' | 'restore';
  busyId: string | null;
  t: Translate;
  onOpen: (drama: DramaSummary) => void;
  onChange: (drama: DramaSummary, action: 'archive' | 'restore') => void;
}) {
  if (dramas.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionCopy}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionSubtitle}>{subtitle}</Text></View>
        <Text style={styles.sectionCount}>{String(dramas.length).padStart(2, '0')}</Text>
      </View>
      <View style={styles.coverGrid}>
        {dramas.map((drama) => (
          <View key={drama.id} style={styles.coverItem}>
            <DramaCoverTile
              title={drama.title}
              premise={drama.resumeLine || drama.premise}
              characterName={drama.characterName}
              mood={drama.mood}
              sceneLabel={`${t('SCENE', 'CẢNH')} ${String(drama.sceneNumber).padStart(2, '0')}`}
              statusLabel={drama.status === 'awaiting_choice' ? t('Your choice is waiting', 'Đang chờ lựa chọn của bạn') : t('Continue from consequence', 'Tiếp tục từ hậu quả')}
              subdued={action === 'restore'}
              onPress={() => onOpen(drama)}
            />
            <View style={styles.coverFooter}>
              <Text style={styles.updated}>{drama.updatedLabel}</Text>
              <ActionButton
                label={action === 'archive' ? t('Pause', 'Tạm dừng') : t('Restore', 'Khôi phục')}
                variant="ghost"
                busy={busyId === drama.id}
                disabled={busyId !== null && busyId !== drama.id}
                onPress={() => onChange(drama, action)}
                style={styles.coverAction}
              />
            </View>
          </View>
        ))}
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
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md, paddingBottom: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderStrong },
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
