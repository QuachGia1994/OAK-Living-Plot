import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { sharedUiCopy, useUiCopy } from '@/features/localization/ui-copy';
import type { StoryHistorySnapshot } from '@/features/story/contracts';
import { useStoryExperienceClient } from '@/features/story/story-client-context';
import { ActionButton, BrandMark, Card, ErrorState, Eyebrow, LoadingState, Pill, Screen } from '@/ui/primitives';
import { colors, spacing } from '@/ui/theme';

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

      <View style={styles.hero}>
        <Eyebrow>{t('Previously on Living Plot', 'Trước đó trên Living Plot')}</Eyebrow>
        <Text style={styles.title}>{history?.title ?? t('Story so far', 'Câu chuyện đến đây')}</Text>
        <Text style={styles.body}>{t('Every episode and choice you locked in is kept here, so you can remember how the drama got to this point.', 'Mỗi tập và lựa chọn đã chốt đều được giữ ở đây để bạn nhớ drama đã đi đến điểm này thế nào.')}</Text>
      </View>

      {error ? <ErrorState title={t('Recap unavailable', 'Tóm tắt không khả dụng')} message={error} retryLabel={sharedUiCopy.tryAgain[locale]} onRetry={() => void load()} /> : null}
      {!history && !error ? <LoadingState label={t('Building your story recap…', 'Đang dựng lại tóm tắt câu chuyện…')} /> : null}

      {history ? (
        <View style={styles.timeline}>
          {history.items.map((item) => (
            <Card key={item.episodeId}>
              <View style={styles.row}>
                <Pill tone={item.status === 'choice_committed' ? 'success' : 'accent'}>EP {item.episodeNumber}</Pill>
                <Text style={styles.status}>{item.status === 'choice_committed' ? t('Choice locked in', 'Đã chốt lựa chọn') : t('Current episode', 'Tập hiện tại')}</Text>
              </View>
              <Text style={styles.episodeTitle}>{item.title}</Text>
              <Text style={styles.body}>{item.summary}</Text>
              {item.choiceLabel ? (
                <View style={styles.choiceBlock}>
                  <Text style={styles.choiceLabel}>{t(`Choice ${item.choiceKey}:`, `Lựa chọn ${item.choiceKey}:`)} {item.choiceLabel}</Text>
                  {item.consequence ? <Text style={styles.consequence}>{item.consequence}</Text> : null}
                </View>
              ) : (
                <Text style={styles.pending}>{t('You have not locked in a choice for this episode yet.', 'Bạn chưa chốt lựa chọn cho tập này.')}</Text>
              )}
            </Card>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

function readParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return value?.trim() || null;
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hero: { gap: spacing.sm },
  title: { color: colors.ink, fontSize: 32, lineHeight: 38, fontWeight: '900' },
  body: { color: colors.inkMuted, fontSize: 14, lineHeight: 22 },
  timeline: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  status: { color: colors.inkMuted, fontSize: 12, fontWeight: '700' },
  episodeTitle: { color: colors.ink, fontSize: 22, lineHeight: 28, fontWeight: '900' },
  choiceBlock: { gap: spacing.xs, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  choiceLabel: { color: colors.accentStrong, fontSize: 14, lineHeight: 20, fontWeight: '800' },
  consequence: { color: colors.storyInk, fontSize: 14, lineHeight: 21 },
  pending: { color: colors.inkMuted, fontSize: 12, lineHeight: 18, fontStyle: 'italic' },
});
