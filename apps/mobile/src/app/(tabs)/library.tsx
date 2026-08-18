import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useDramaExperienceClient } from '@/features/drama/drama-client-context';
import { sharedUiCopy, useUiCopy } from '@/features/localization/ui-copy';
import type { DramaLibrarySnapshot, DramaSummary } from '@/features/drama/contracts';
import { DramaEmptyStage, DramaLoadingStage, DramaCoverTile } from '@/ui/drama-visuals';
import { ActionButton, BrandMark, ErrorState, Eyebrow, Screen } from '@/ui/primitives';
import { colors, radius, spacing, typography } from '@/ui/theme';

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
  const featured = snapshot?.active[0] ?? null;
  const restActive = snapshot?.active.slice(1) ?? [];

  return (
    <Screen>
      <View style={styles.topBar}><BrandMark /></View>
      <View style={styles.hero}>
        <Eyebrow>{t('Library', 'Thư viện')}</Eyebrow>
        <Text style={styles.title}>{t('Your dramas', 'Drama của bạn')}</Text>
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
          {featured ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t('Now playing', 'Đang phát')}</Text>
                <Text style={styles.sectionCount}>{String(snapshot.active.length).padStart(2, '0')}</Text>
              </View>
              <DramaCoverTile
                title={featured.title}
                premise={featured.resumeLine || featured.premise}
                characterName={featured.characterName}
                mood={featured.mood}
                sceneLabel={`${t('SCENE', 'CẢNH')} ${String(featured.sceneNumber).padStart(2, '0')}`}
                statusLabel={featured.status === 'awaiting_choice' ? t('Your choice is waiting', 'Đang chờ lựa chọn của bạn') : t('Continue from consequence', 'Tiếp tục từ hậu quả')}
                onPress={() => router.push({ pathname: '/drama', params: { dramaId: featured.id } })}
              />
              <View style={styles.coverFooter}>
                <Text style={styles.updated}>{featured.updatedLabel}</Text>
                <ActionButton
                  label={t('Pause', 'Tạm dừng')}
                  variant="ghost"
                  busy={busyId === featured.id}
                  disabled={busyId !== null && busyId !== featured.id}
                  onPress={() => change(featured, 'archive')}
                  style={styles.coverAction}
                />
              </View>
            </View>
          ) : null}

          {restActive.length > 0 ? (
            <LibraryListSection
              title={t('My dramas', 'Drama của tôi')}
              dramas={restActive}
              action="archive"
              busyId={busyId}
              t={t}
              onOpen={(drama) => router.push({ pathname: '/drama', params: { dramaId: drama.id } })}
              onChange={change}
            />
          ) : null}

          {snapshot.archived.length > 0 ? (
            <LibraryListSection
              title={t('Paused', 'Đã tạm dừng')}
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

function LibraryListSection({
  title,
  dramas,
  action,
  busyId,
  t,
  onOpen,
  onChange,
}: {
  title: string;
  dramas: DramaSummary[];
  action: 'archive' | 'restore';
  busyId: string | null;
  t: Translate;
  onOpen: (drama: DramaSummary) => void;
  onChange: (drama: DramaSummary, action: 'archive' | 'restore') => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>{String(dramas.length).padStart(2, '0')}</Text>
      </View>
      <View style={styles.rowList}>
        {dramas.map((drama) => (
          <LibraryRow
            key={drama.id}
            drama={drama}
            action={action}
            busy={busyId === drama.id}
            disabled={busyId !== null && busyId !== drama.id}
            t={t}
            onOpen={() => onOpen(drama)}
            onChange={() => onChange(drama, action)}
          />
        ))}
      </View>
    </View>
  );
}

function LibraryRow({
  drama,
  action,
  busy,
  disabled,
  t,
  onOpen,
  onChange,
}: {
  drama: DramaSummary;
  action: 'archive' | 'restore';
  busy: boolean;
  disabled: boolean;
  t: Translate;
  onOpen: () => void;
  onChange: () => void;
}) {
  const scene = `${t('SCENE', 'CẢNH')} ${String(drama.sceneNumber).padStart(2, '0')}`;
  const status = drama.status === 'awaiting_choice'
    ? t('Choice waiting', 'Đang chờ lựa chọn')
    : t('Continue', 'Tiếp tục');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${drama.title}. ${scene}. ${status}`}
      onPress={onOpen}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.thumb, action === 'restore' && styles.thumbMuted]}>
        <Text style={styles.thumbMark}>{drama.characterName.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle} numberOfLines={1}>{drama.title}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>{scene} · {status}</Text>
        <Text style={styles.rowUpdated} numberOfLines={1}>{drama.updatedLabel}</Text>
      </View>
      <ActionButton
        label={action === 'archive' ? t('Pause', 'Tạm dừng') : t('Restore', 'Khôi phục')}
        variant="ghost"
        busy={busy}
        disabled={disabled}
        onPress={onChange}
        style={styles.rowAction}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hero: { gap: spacing.xs, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  title: { color: colors.ink, fontFamily: typography.display, fontSize: 24, lineHeight: 29, fontWeight: '700', letterSpacing: -0.3 },
  emptyWrap: { gap: spacing.md },
  section: { gap: spacing.md, paddingTop: spacing.lg },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderStrong,
  },
  sectionTitle: { color: colors.ink, fontFamily: typography.display, fontSize: 18, lineHeight: 22, fontWeight: '700' },
  sectionCount: { color: colors.accentStrong, fontFamily: typography.mono, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  coverFooter: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  updated: { flex: 1, color: colors.quietInk, fontFamily: typography.mono, fontSize: 8, lineHeight: 13, letterSpacing: 0.4 },
  coverAction: { minHeight: 40, paddingHorizontal: spacing.sm },
  rowList: { gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 72,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  rowPressed: { opacity: 0.88 },
  thumb: {
    width: 48,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceWarmDeep,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accentSoft,
  },
  thumbMuted: { opacity: 0.7 },
  thumbMark: { color: colors.accentStrong, fontFamily: typography.display, fontSize: 20, fontWeight: '700' },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { color: colors.ink, fontFamily: typography.display, fontSize: 16, lineHeight: 20, fontWeight: '700' },
  rowMeta: { color: colors.inkMuted, fontSize: 12, lineHeight: 16 },
  rowUpdated: { color: colors.quietInk, fontFamily: typography.mono, fontSize: 8, letterSpacing: 0.4 },
  rowAction: { minHeight: 40, paddingHorizontal: spacing.sm },
});
