import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { buildCharacterProfile } from '@/features/drama/character-profile';
import type { Drama, DramaHistory } from '@/features/drama/contracts';
import { useDramaExperienceClient } from '@/features/drama/drama-client-context';
import { dramaRoute } from '@/features/drama/drama-navigation';
import { dramaMoodLabel } from '@/features/localization/drama-labels';
import { sharedUiCopy, useUiCopy } from '@/features/localization/ui-copy';
import { CharacterPortraitCard } from '@/features/portrait/character-portrait-card';
import { DramaLoadingStage } from '@/ui/drama-visuals';
import { conceptFlowStep } from '@/ui/concept-flow';
import { ActionButton, BrandMark, ConceptStageHeader, ErrorState, Eyebrow, OrnamentDivider, Pill, Screen, TaskActionDock } from '@/ui/primitives';
import { classical, colors, radius, spacing, typography } from '@/ui/theme';
import { readParam } from '@/lib/route-params';

type ProfileTab = 'identity' | 'journey' | 'memory';

export default function CharacterScreen() {
  const router = useRouter();
  const { locale, t } = useUiCopy();
  const params = useLocalSearchParams<{ dramaId?: string | string[] }>();
  const dramaId = useMemo(() => readParam(params.dramaId), [params.dramaId]);
  const client = useDramaExperienceClient();
  const stage = conceptFlowStep(locale, 'cast');
  const [drama, setDrama] = useState<Drama | null>(null);
  const [history, setHistory] = useState<DramaHistory | null>(null);
  const [tab, setTab] = useState<ProfileTab>('identity');
  const [error, setError] = useState<string | null>(dramaId ? null : t('This character link is missing its drama identifier.', 'Liên kết nhân vật thiếu mã drama.'));

  const load = useCallback(async () => {
    if (!dramaId) {
      setError(t('This character link is missing its drama identifier.', 'Liên kết nhân vật thiếu mã drama.'));
      return;
    }
    setError(null);
    try {
      const [nextDrama, nextHistory] = await Promise.all([
        client.loadDrama(dramaId),
        client.loadHistory(dramaId),
      ]);
      setDrama(nextDrama);
      setHistory(nextHistory);
    } catch {
      setError(t('The canonical character profile could not be loaded.', 'Không thể tải hồ sơ nhân vật chuẩn.'));
    }
  }, [client, dramaId, t]);

  useEffect(() => {
    if (!dramaId) return;
    let active = true;
    void Promise.all([
      client.loadDrama(dramaId),
      client.loadHistory(dramaId),
    ])
      .then(([nextDrama, nextHistory]) => {
        if (!active) return;
        setDrama(nextDrama);
        setHistory(nextHistory);
        setError(null);
      })
      .catch(() => {
        if (active) setError(t('The canonical character profile could not be loaded.', 'Không thể tải hồ sơ nhân vật chuẩn.'));
      });
    return () => { active = false; };
  }, [client, dramaId, t]);

  const profile = useMemo(
    () => drama && history ? buildCharacterProfile(drama, history) : null,
    [drama, history],
  );
  const backToDrama = () => {
    if (router.canGoBack()) return router.back();
    router.replace(dramaId ? dramaRoute(dramaId) : '/');
  };
  const footer = profile ? (
    <TaskActionDock
      eyebrow={t(`Current scene ${profile.currentSceneNumber}`, `Cảnh hiện tại ${profile.currentSceneNumber}`)}
      title={profile.currentSceneTitle}
      detail={t('Return without changing canonical story state.', 'Quay lại mà không thay đổi trạng thái chuẩn của câu chuyện.')}
    >
      <ActionButton label={t('Back to drama', 'Quay lại drama')} onPress={backToDrama} />
    </TaskActionDock>
  ) : undefined;

  return (
    <Screen contentStyle={styles.screen} footer={footer}>
      <View style={styles.topBar}>
        <BrandMark />
        <ActionButton label={t('Back', 'Quay lại')} variant="ghost" onPress={backToDrama} />
      </View>

      <ConceptStageHeader
        number={stage.number}
        kicker={stage.kicker}
        title={profile?.name ?? t('Living character', 'Nhân vật sống')}
        description={stage.description}
        meta={profile ? t(`${profile.dramaTitle} · Scene ${profile.currentSceneNumber}`, `${profile.dramaTitle} · Cảnh ${profile.currentSceneNumber}`) : undefined}
      />

      {error ? (
        <ErrorState
          title={t('Character unavailable', 'Nhân vật không khả dụng')}
          message={error}
          retryLabel={sharedUiCopy.tryAgain[locale]}
          onRetry={() => void load()}
        />
      ) : null}

      {!profile && !error ? (
        <DramaLoadingStage
          label={t('Restoring the living profile…', 'Đang khôi phục hồ sơ sống…')}
          detail={t('Loading identity, current Scene and canonical memories.', 'Đang tải danh tính, Cảnh hiện tại và ký ức chuẩn.')}
          locale={locale}
        />
      ) : null}

      {profile && drama ? (
        <>
          <CharacterPortraitCard
            dramaId={drama.id}
            characterName={profile.name}
            storyRevision={`${drama.currentScene.number}:${drama.currentScene.branch.state}:${profile.choicesMade}`}
            showStageLabel={false}
          />

          <ProfileTabs current={tab} locale={locale} onSelect={setTab} />

          {tab === 'identity' ? (
            <View style={styles.profilePanel}>
              <View style={styles.panelHeading}>
                <Eyebrow>{t('Canonical identity', 'Danh tính chuẩn')}</Eyebrow>
                <Pill tone="success">{t('STABLE', 'ỔN ĐỊNH')}</Pill>
              </View>
              <Text style={styles.profileName}>{profile.name}</Text>
              <OrnamentDivider compact />
              <Text style={styles.premise}>{profile.premise}</Text>
              <View style={styles.factList}>
                <ProfileFact label={t('Role', 'Vai trò')} value={t('Protagonist', 'Nhân vật chính')} />
                <ProfileFact label={t('Drama', 'Drama')} value={profile.dramaTitle} />
                <ProfileFact label={t('Mood', 'Không khí')} value={dramaMoodLabel(profile.mood, locale)} />
                <ProfileFact label={t('Current scene', 'Cảnh hiện tại')} value={`${profile.currentSceneNumber} · ${profile.currentSceneTitle}`} />
              </View>
            </View>
          ) : null}

          {tab === 'journey' ? (
            <View style={styles.profilePanel}>
              <Eyebrow>{t('Canonical journey', 'Hành trình chuẩn')}</Eyebrow>
              <View style={styles.metrics}>
                <ProfileMetric label={t('Scenes', 'Cảnh')} value={profile.scenesRemembered} />
                <ProfileMetric label={t('Choices', 'Lựa chọn')} value={profile.choicesMade} />
                <ProfileMetric label={t('Current', 'Hiện tại')} value={profile.currentSceneNumber} />
              </View>
              <View style={styles.journeyCard}>
                <Text style={styles.journeyKicker}>{t('LATEST CANONICAL EFFECT', 'HỆ QUẢ CHUẨN GẦN NHẤT')}</Text>
                <Text style={styles.journeyText}>{profile.lastCommittedConsequence ?? t('No branch consequence has been committed yet.', 'Chưa có hệ quả nhánh nào được chốt.')}</Text>
              </View>
            </View>
          ) : null}

          {tab === 'memory' ? (
            <View style={styles.profilePanel}>
              <View style={styles.panelHeading}>
                <Eyebrow>{t('Recent canonical memories', 'Ký ức chuẩn gần đây')}</Eyebrow>
                <Text style={styles.memoryCount}>{profile.recentMemories.length}/4</Text>
              </View>
              {profile.recentMemories.length === 0 ? (
                <Text style={styles.emptyMemory}>{t('No Scene memories are available yet.', 'Chưa có ký ức Cảnh nào.')}</Text>
              ) : profile.recentMemories.map((memory) => (
                <View key={memory.sceneId} style={styles.memoryCard}>
                  <View style={styles.memoryHeader}>
                    <Text style={styles.memoryScene}>{t('SCENE', 'CẢNH')} {String(memory.sceneNumber).padStart(2, '0')}</Text>
                    <Text style={styles.memoryTitle}>{memory.title}</Text>
                  </View>
                  <Text style={styles.memorySummary}>{memory.summary}</Text>
                  {memory.choiceLabel ? <Text style={styles.memoryChoice}>{t('Choice', 'Lựa chọn')}: {memory.choiceLabel}</Text> : null}
                  {memory.consequence ? <Text style={styles.memoryConsequence}>{memory.consequence}</Text> : null}
                </View>
              ))}
            </View>
          ) : null}

          <ActionButton
            label={t('Open full timeline', 'Mở toàn bộ dòng lịch sử')}
            variant="secondary"
            onPress={() => router.push({ pathname: '/library/history', params: { dramaId: drama.id } })}
          />
        </>
      ) : null}
    </Screen>
  );
}

function ProfileTabs({ current, locale, onSelect }: { current: ProfileTab; locale: 'en' | 'vi'; onSelect: (tab: ProfileTab) => void }) {
  const labels: Record<ProfileTab, string> = locale === 'vi'
    ? { identity: 'THÔNG TIN', journey: 'HÀNH TRÌNH', memory: 'KÝ ỨC' }
    : { identity: 'IDENTITY', journey: 'JOURNEY', memory: 'MEMORY' };
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {(Object.keys(labels) as ProfileTab[]).map((tab) => {
        const selected = tab === current;
        return (
          <Pressable
            key={tab}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onSelect(tab)}
            style={({ pressed }) => [styles.tab, selected && styles.tabSelected, pressed && styles.tabPressed]}
          >
            <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{labels[tab]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ProfileFact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.factRow}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

function ProfileMetric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{String(value).padStart(2, '0')}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.md },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderStrong,
  },
  tab: {
    minHeight: 46,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabSelected: { borderBottomColor: classical.gold, backgroundColor: classical.patina },
  tabPressed: { opacity: 0.72 },
  tabLabel: { color: colors.quietInk, fontFamily: typography.mono, fontSize: 8, fontWeight: '900', letterSpacing: 0.75 },
  tabLabelSelected: { color: colors.ink },
  profilePanel: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: classical.goldDeep,
    backgroundColor: colors.surfaceGlass,
  },
  panelHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  profileName: { color: colors.ink, fontFamily: typography.display, fontSize: 30, lineHeight: 34, fontWeight: '700' },
  premise: { color: colors.narrativeInk, fontFamily: typography.display, fontSize: 17, lineHeight: 25, fontWeight: '600' },
  factList: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong },
  factRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
  factLabel: { width: 92, color: colors.quietInk, fontFamily: typography.mono, fontSize: 8, lineHeight: 14, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  factValue: { minWidth: 0, flex: 1, color: colors.ink, fontSize: 12, lineHeight: 18, fontWeight: '700', textAlign: 'right' },
  metrics: { flexDirection: 'row', gap: spacing.xs },
  metric: { minWidth: 0, flex: 1, gap: 3, padding: spacing.sm, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: classical.hairline, backgroundColor: colors.surfaceQuiet },
  metricValue: { color: colors.violetStrong, fontFamily: typography.display, fontSize: 24, lineHeight: 28, fontWeight: '700' },
  metricLabel: { color: colors.quietInk, fontFamily: typography.mono, fontSize: 8, lineHeight: 11, fontWeight: '900', letterSpacing: 0.55, textTransform: 'uppercase' },
  journeyCard: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: classical.hairlineSoft, backgroundColor: colors.surfaceQuiet },
  journeyKicker: { color: colors.accentStrong, fontFamily: typography.mono, fontSize: 8, fontWeight: '900', letterSpacing: 0.75 },
  journeyText: { color: colors.narrativeInk, fontFamily: typography.display, fontSize: 17, lineHeight: 25, fontWeight: '600' },
  memoryCount: { color: colors.quietInk, fontFamily: typography.mono, fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  emptyMemory: { color: colors.quietInk, fontSize: 12, lineHeight: 18 },
  memoryCard: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: classical.hairline, backgroundColor: colors.surfaceQuiet },
  memoryHeader: { gap: 3 },
  memoryScene: { color: colors.violetStrong, fontFamily: typography.mono, fontSize: 8, fontWeight: '900', letterSpacing: 0.75 },
  memoryTitle: { color: colors.ink, fontFamily: typography.display, fontSize: 17, lineHeight: 22, fontWeight: '700' },
  memorySummary: { color: colors.inkMuted, fontSize: 12, lineHeight: 18 },
  memoryChoice: { color: colors.accentStrong, fontFamily: typography.mono, fontSize: 9, lineHeight: 14, fontWeight: '800' },
  memoryConsequence: { color: colors.narrativeInk, fontFamily: typography.display, fontSize: 14, lineHeight: 21, fontStyle: 'italic' },
});
