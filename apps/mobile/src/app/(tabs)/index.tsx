import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useMobileAuth } from '@/features/auth/mobile-auth-context';
import { useDramaExperienceClient } from '@/features/drama/drama-client-context';
import { sharedUiCopy, useUiCopy } from '@/features/localization/ui-copy';
import type { DramaHomeSnapshot, DramaSummary } from '@/features/drama/contracts';
import { useRefreshOnForeground } from '@/lib/use-refresh-on-foreground';
import { DramaCoverTile, DramaLoadingStage, DramaPoster, DramaUtilityHero } from '@/ui/drama-visuals';
import { ActionButton, BrandMark, ErrorState, Eyebrow, Screen } from '@/ui/primitives';
import { colors, spacing, typography } from '@/ui/theme';

export default function HomeScreen() {
  const router = useRouter();
  const auth = useMobileAuth();
  const { locale, t } = useUiCopy();
  const dramaClient = useDramaExperienceClient();
  const [snapshot, setSnapshot] = useState<DramaHomeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (auth.configured && (!auth.isLoaded || !auth.isSignedIn)) return;
    setError(null);
    try {
      setSnapshot(await dramaClient.loadHome());
    } catch {
      setError(t('Recent dramas could not be loaded. Canonical drama state is unchanged.', 'Không thể tải các drama gần đây. Trạng thái drama chuẩn không thay đổi.'));
    }
  }, [auth.configured, auth.isLoaded, auth.isSignedIn, dramaClient, t]);

  useRefreshOnForeground(load);

  function openDailySpark(source: DramaHomeSnapshot) {
    const prompt = source.retention.dailyPrompt;
    router.push({ pathname: '/create', params: { premise: prompt.premise, mood: prompt.mood, characterName: prompt.characterName } });
  }

  useEffect(() => {
    if (auth.configured && (!auth.isLoaded || !auth.isSignedIn)) return;
    let active = true;
    void dramaClient.loadHome()
      .then((next) => {
        if (!active) return;
        setSnapshot(next);
        setError(null);
      })
      .catch(() => {
        if (active) setError(t('Recent dramas could not be loaded. Canonical drama state is unchanged.', 'Không thể tải các drama gần đây. Trạng thái drama chuẩn không thay đổi.'));
      });
    return () => { active = false; };
  }, [auth.configured, auth.isLoaded, auth.isSignedIn, dramaClient, t]);

  if (auth.configured && !auth.isLoaded) {
    return <Screen><BrandMark /><DramaLoadingStage label={t('Opening your Living Plot session…', 'Đang mở phiên Living Plot…')} locale={locale} /></Screen>;
  }

  if (auth.configured && !auth.isSignedIn) {
    return (
      <Screen>
        <BrandMark />
        <DramaUtilityHero
          kicker={t('YOUR DRAMAS, REMEMBERED', 'DRAMA CỦA BẠN ĐƯỢC GHI NHỚ')}
          title={t('Pick what happens. Return for the consequence.', 'Chọn điều xảy ra. Quay lại để xem hậu quả.')}
          detail={t('One email code keeps dramas and choices linked across devices.', 'Một mã email giữ drama và lựa chọn liên kết giữa các thiết bị.')}
          mood="mysterious"
          characterName="Identity"
        />
        <ActionButton label={sharedUiCopy.signIn[locale]} onPress={() => router.push('/auth')} />
      </Screen>
    );
  }

  if (!snapshot && !error) {
    return (
      <Screen>
        <BrandMark />
        <DramaLoadingStage
          label={t('Opening tonight’s drama…', 'Đang mở drama tối nay…')}
          detail={t('Restoring your latest scene and decision point.', 'Đang khôi phục cảnh gần nhất và điểm quyết định tiếp theo.')}
          locale={locale}
        />
      </Screen>
    );
  }

  const featuredDrama = snapshot?.recentDramas[0] ?? null;
  const dailyPrompt = snapshot?.retention.dailyPrompt ?? null;

  return (
    <Screen>
      <View style={styles.topBar}>
        <BrandMark />
        {auth.configured && auth.isSignedIn ? <ActionButton label={sharedUiCopy.signOut[locale]} variant="ghost" onPress={() => void auth.signOut()} /> : null}
      </View>

      {snapshot && dailyPrompt ? (
        <DramaPoster
          title={featuredDrama?.title ?? dailyPrompt.label}
          premise={featuredDrama?.resumeLine ?? dailyPrompt.premise}
          characterName={featuredDrama?.characterName ?? dailyPrompt.characterName}
          mood={featuredDrama?.mood ?? dailyPrompt.mood}
          sceneLabel={featuredDrama
            ? t(`SCENE ${featuredDrama.sceneNumber} · CONTINUE`, `CẢNH ${featuredDrama.sceneNumber} · TIẾP TỤC`)
            : t('TODAY · NEW DRAMA', 'HÔM NAY · DRAMA MỚI')}
          actionLabel={featuredDrama ? t('Resume drama', 'Tiếp tục drama') : t('Start today’s drama', 'Bắt đầu drama hôm nay')}
          onPress={() => featuredDrama
            ? router.push({ pathname: '/drama', params: { dramaId: featuredDrama.id } })
            : openDailySpark(snapshot)}
          style={styles.heroPoster}
        />
      ) : null}

      {error ? (
        <ErrorState title={t('Couldn’t load your dramas', 'Không thể tải drama')} message={error} retryLabel={sharedUiCopy.tryAgain[locale]} onRetry={() => void load()} />
      ) : null}

      {snapshot ? (
        <>
          {featuredDrama ? (
            <UpNextShelf
              snapshot={snapshot}
              featuredDramaId={featuredDrama.id}
              t={t}
              onOpenDrama={(drama) => router.push({ pathname: '/drama', params: { dramaId: drama.id } })}
              onOpenSpark={() => openDailySpark(snapshot)}
            />
          ) : (
            <View style={styles.firstRunCue}>
              <Text style={styles.firstRunTitle}>{t('ONE SPARK', 'MỘT TIA LỬA')}</Text><Text style={styles.firstRunDivider}>·</Text>
              <Text style={styles.firstRunTitle}>{t('ONE MINUTE', 'MỘT PHÚT')}</Text><Text style={styles.firstRunDivider}>·</Text>
              <Text style={styles.firstRunTitle}>{t('THREE CHOICES', 'BA LỰA CHỌN')}</Text>
            </View>
          )}

          <DramaHud snapshot={snapshot} t={t} />

          <View style={styles.plusRow}>
            <View style={styles.plusCopy}><Text style={styles.plusKicker}>{t('PLUS · 20 SCENES / 10 VOICES', 'PLUS · 20 CẢNH / 10 GIỌNG')}</Text></View>
            <ActionButton label={t('View Plus', 'Xem Plus')} variant="ghost" onPress={() => router.push('/plus')} />
          </View>
        </>
      ) : null}

      {!auth.configured ? <Text style={styles.previewNote}>{t('Preview build · core drama flow works without sign-in.', 'Bản xem trước · luồng drama chính hoạt động không cần đăng nhập.')}</Text> : null}
    </Screen>
  );
}

type Translate = (en: string, vi: string) => string;

function DramaHud({ snapshot, t }: { snapshot: DramaHomeSnapshot; t: Translate }) {
  const { retention, quota } = snapshot;
  return (
    <View style={styles.hud}>
      <HudMetric label={t('Streak', 'Chuỗi')} value={retention.currentStreakDays > 0 ? `${retention.currentStreakDays}D` : '—'} />
      <HudMetric label={t('Choices', 'Lựa chọn')} value={String(retention.choicesMade)} />
      <HudMetric label={t('Scenes left', 'Cảnh còn lại')} value={`${quota.textRemaining}/${quota.textLimit}`} accent />
      <HudMetric label={t('Voice left', 'Giọng còn lại')} value={`${quota.voiceRemaining}/${quota.voiceLimit}`} />
    </View>
  );
}

function HudMetric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <View style={styles.hudMetric}><Text style={[styles.hudValue, accent && styles.hudValueAccent]}>{value}</Text><Text style={styles.hudLabel}>{label}</Text></View>;
}

function UpNextShelf({ snapshot, featuredDramaId, t, onOpenDrama, onOpenSpark }: {
  snapshot: DramaHomeSnapshot;
  featuredDramaId: string;
  t: Translate;
  onOpenDrama: (drama: DramaSummary) => void;
  onOpenSpark: () => void;
}) {
  const prompt = snapshot.retention.dailyPrompt;
  const secondaryDramas = snapshot.recentDramas.filter((drama) => drama.id !== featuredDramaId).slice(0, 3);
  return (
    <View style={styles.shelfSection}>
      <View style={styles.shelfHeader}>
        <View><Eyebrow>{t('Up next', 'Tiếp theo')}</Eyebrow><Text style={styles.shelfTitle}>{t('Choose another drama', 'Chọn drama khác')}</Text></View>
        <Text style={styles.shelfCount}>{String(secondaryDramas.length + 1).padStart(2, '0')}</Text>
      </View>
      <View style={styles.coverGrid}>
        <View style={styles.coverItem}>
          <DramaCoverTile title={prompt.label} premise={prompt.premise} characterName={prompt.characterName} mood={prompt.mood} sceneLabel={t('NEW · TODAY', 'MỚI · HÔM NAY')} statusLabel={t('Start a new drama', 'Bắt đầu drama mới')} onPress={onOpenSpark} />
        </View>
        {secondaryDramas.map((drama) => (
          <View key={drama.id} style={styles.coverItem}>
            <DramaCoverTile
              title={drama.title}
              premise={drama.resumeLine || drama.premise}
              characterName={drama.characterName}
              mood={drama.mood}
              sceneLabel={`${t('SCENE', 'CẢNH')} ${String(drama.sceneNumber).padStart(2, '0')}`}
              statusLabel={drama.status === 'awaiting_choice' ? t('Your choice is waiting', 'Đang chờ lựa chọn') : t('Continue from consequence', 'Tiếp tục từ hậu quả')}
              onPress={() => onOpenDrama(drama)}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroPoster: { marginHorizontal: -spacing.lg, borderRadius: 0 },
  hud: { flexDirection: 'row', flexWrap: 'wrap', gap: 0, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  hudMetric: { minWidth: 128, flexGrow: 1, flexBasis: '46%', gap: 2, paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
  hudValue: { color: colors.ink, fontFamily: typography.mono, fontSize: 15, fontWeight: '900', letterSpacing: -0.2 },
  hudValueAccent: { color: colors.accentStrong },
  hudLabel: { color: colors.quietInk, fontFamily: typography.mono, fontSize: 8, lineHeight: 12, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  firstRunCue: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
  firstRunTitle: { color: colors.ink, fontFamily: typography.mono, fontSize: 9, lineHeight: 14, fontWeight: '900', letterSpacing: 1 },
  firstRunDivider: { color: colors.accentStrong, fontSize: 14 },
  shelfSection: { gap: spacing.md, paddingTop: spacing.lg },
  shelfHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md },
  shelfTitle: { marginTop: spacing.xs, color: colors.ink, fontFamily: typography.display, fontSize: 24, lineHeight: 28, fontWeight: '700', letterSpacing: -0.4 },
  shelfCount: { color: colors.accentStrong, fontFamily: typography.mono, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  coverGrid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: spacing.sm },
  coverItem: { minWidth: 148, flexGrow: 1, flexBasis: '46%' },
  plusRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle },
  plusCopy: { flex: 1, minWidth: 190 },
  plusKicker: { color: colors.accentStrong, fontFamily: typography.mono, fontSize: 9, lineHeight: 14, fontWeight: '900', letterSpacing: 0.9 },
  previewNote: { color: colors.quietInk, fontSize: 10, lineHeight: 16, textAlign: 'center', paddingHorizontal: spacing.md },
});
