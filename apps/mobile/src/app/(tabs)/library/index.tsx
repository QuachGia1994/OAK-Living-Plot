import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useDramaExperienceClient } from '@/features/drama/drama-client-context';
import { sharedUiCopy, useUiCopy } from '@/features/localization/ui-copy';
import type { DramaLibrarySnapshot, DramaSummary } from '@/features/drama/contracts';
import { libraryView, type DramaLibraryFilter } from '@/features/drama/library-view';
import { DramaEmptyStage, DramaLoadingStage, DramaCoverTile } from '@/ui/drama-visuals';
import { ActionButton, BrandMark, ErrorState, Eyebrow, Screen } from '@/ui/primitives';
import { colors, radius, spacing, typography } from '@/ui/theme';

export default function DramaLibraryScreen() {
  const router = useRouter();
  const { locale, t } = useUiCopy();
  const client = useDramaExperienceClient();
  const [snapshot, setSnapshot] = useState<DramaLibrarySnapshot | null>(null);
  const [filter, setFilter] = useState<DramaLibraryFilter>('continue');
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
  const view = snapshot ? libraryView(snapshot, filter) : null;
  const featured = view?.active[0] ?? null;
  const restActive = view?.active.slice(1) ?? [];
  const filteredEmpty = Boolean(snapshot && !emptyLibrary && view?.total === 0);

  return (
    <Screen>
      <View style={styles.topBar}><BrandMark /></View>
      <View style={styles.hero}>
        <Eyebrow>{t('Library', 'Thư viện')}</Eyebrow>
        <View style={styles.heroTitleRow}>
          <Text style={styles.title}>{t('Your dramas', 'Drama của bạn')}</Text>
          <ActionButton label={t('New drama', 'Drama mới')} variant="ghost" onPress={() => router.push('/create')} style={styles.newDramaAction} />
        </View>
      </View>

      {snapshot && !emptyLibrary ? <LibraryFilterRail filter={filter} snapshot={snapshot} locale={locale} onChange={setFilter} /> : null}

      {error ? <ErrorState title={t('Drama shelf could not update', 'Không thể cập nhật kệ drama')} message={error} retryLabel={sharedUiCopy.tryAgain[locale]} onRetry={() => void load()} /> : null}
      {!snapshot && !error ? <DramaLoadingStage label={t('Lighting your drama shelf…', 'Đang thắp sáng kệ drama…')} detail={t('Restoring covers, scene positions and decision points.', 'Đang khôi phục bìa, vị trí cảnh và điểm quyết định.')} locale={locale} /> : null}

      {emptyLibrary ? (
        <View style={styles.emptyWrap}>
          <DramaEmptyStage title={t('No drama is playing yet.', 'Chưa có drama nào đang phát.')} detail={t('Give Living Plot one spark and your first drama will appear here.', 'Cho Living Plot một tia lửa và drama đầu tiên sẽ xuất hiện ở đây.')} locale={locale} />
          <ActionButton label={t('Create my first drama', 'Tạo drama đầu tiên')} onPress={() => router.push('/create')} />
        </View>
      ) : null}

      {filteredEmpty ? (
        <DramaEmptyStage
          title={filter === 'paused' ? t('No paused dramas.', 'Chưa có drama tạm dừng.') : t('Nothing on this shelf yet.', 'Kệ này chưa có drama.')}
          detail={filter === 'paused' ? t('Pause a drama and it will stay here without changing its canonical history.', 'Tạm dừng một drama và nó sẽ nằm ở đây mà không đổi lịch sử chuẩn.') : t('Create a drama or switch shelves.', 'Tạo drama mới hoặc chuyển kệ.')}
          locale={locale}
        />
      ) : null}

      {snapshot && !emptyLibrary && !filteredEmpty ? (
        <>
          {featured ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t('Now playing', 'Đang phát')}</Text>
                <Text style={styles.sectionCount}>{String(view?.active.length ?? 0).padStart(2, '0')}</Text>
              </View>
              <DramaCoverTile
                title={featured.title}
                premise={featured.resumeLine || featured.premise}
                characterName={featured.characterName}
                mood={featured.mood}
                sceneLabel={`${t('SCENE', 'CẢNH')} ${String(featured.sceneNumber).padStart(2, '0')}`}
                statusLabel={featured.status === 'awaiting_choice' ? t('Your choice is waiting', 'Đang chờ lựa chọn của bạn') : t('Continue from consequence', 'Tiếp tục từ hậu quả')}
                onPress={() => router.push({ pathname: '/library/drama', params: { dramaId: featured.id } })}
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
              onOpen={(drama) => router.push({ pathname: '/library/drama', params: { dramaId: drama.id } })}
              onChange={change}
            />
          ) : null}

          {(view?.archived.length ?? 0) > 0 ? (
            <LibraryListSection
              title={t('Paused', 'Đã tạm dừng')}
              dramas={view?.archived ?? []}
              action="restore"
              busyId={busyId}
              t={t}
              onOpen={(drama) => router.push({ pathname: '/library/drama', params: { dramaId: drama.id, readOnly: '1' } })}
              onChange={change}
            />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

type Translate = (en: string, vi: string) => string;

function LibraryFilterRail({
  filter,
  snapshot,
  locale,
  onChange,
}: {
  filter: DramaLibraryFilter;
  snapshot: DramaLibrarySnapshot;
  locale: 'en' | 'vi';
  onChange: (filter: DramaLibraryFilter) => void;
}) {
  const options: { value: DramaLibraryFilter; label: string; count: number }[] = [
    { value: 'continue', label: locale === 'vi' ? 'Tiếp tục' : 'Continue', count: snapshot.active.length },
    { value: 'all', label: locale === 'vi' ? 'Tất cả' : 'All', count: snapshot.active.length + snapshot.archived.length },
    { value: 'paused', label: locale === 'vi' ? 'Tạm dừng' : 'Paused', count: snapshot.archived.length },
  ];
  return (
    <View style={styles.filterRail} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = filter === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [styles.filterTab, selected && styles.filterTabSelected, pressed && styles.filterTabPressed]}
          >
            <Text style={[styles.filterLabel, selected && styles.filterLabelSelected]}>{option.label}</Text>
            <Text style={[styles.filterCount, selected && styles.filterCountSelected]}>{String(option.count).padStart(2, '0')}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

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
  heroTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { flex: 1, minWidth: 180, color: colors.ink, fontFamily: typography.display, fontSize: 24, lineHeight: 29, fontWeight: '700', letterSpacing: -0.3 },
  newDramaAction: { minHeight: 40, paddingHorizontal: spacing.sm },
  filterRail: { flexDirection: 'row', overflow: 'hidden', borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, backgroundColor: colors.surfaceQuiet },
  filterTab: { minHeight: 46, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, backgroundColor: 'transparent' },
  filterTabSelected: { backgroundColor: colors.surfaceWarmDeep },
  filterTabPressed: { opacity: 0.76 },
  filterLabel: { color: colors.inkMuted, fontSize: 11, fontWeight: '800' },
  filterLabelSelected: { color: colors.ink },
  filterCount: { color: colors.quietInk, fontFamily: typography.mono, fontSize: 8, fontWeight: '900' },
  filterCountSelected: { color: colors.accentStrong },
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
