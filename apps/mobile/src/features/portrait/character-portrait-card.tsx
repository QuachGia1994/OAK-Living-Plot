import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { useUiCopy } from '@/features/localization/ui-copy';
import { ActionButton, Eyebrow, Pill } from '@/ui/primitives';
import { classical, colors, radius, spacing, typography } from '@/ui/theme';
import { CharacterPortraitClientError, type PortraitSnapshot } from './portrait-client';
import { useCharacterPortraitClient } from './portrait-runtime';

const fallbackPortrait = require('../../../assets/living-plot-scene-mina-3d.jpg') as ImageSourcePropType;

export function CharacterPortraitCard({
  dramaId,
  characterName,
  storyRevision,
  showStageLabel = true,
}: {
  dramaId: string;
  characterName: string;
  storyRevision: string;
  showStageLabel?: boolean;
}) {
  const client = useCharacterPortraitClient();
  const { t } = useUiCopy();
  const [snapshot, setSnapshot] = useState<PortraitSnapshot | null>(null);
  const [source, setSource] = useState<ImageSourcePropType>(fallbackPortrait);
  const [busy, setBusy] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!client.configured) return;
    let active = true;
    void client.status(dramaId)
      .then(async (next) => {
        if (!active) return;
        setSnapshot(next);
        if (next.status === 'ready' || next.status === 'stale') {
          const nextSource = await client.source(dramaId);
          if (active) {
            setSource(nextSource);
            setMediaFailed(false);
          }
        }
      })
      .catch(() => {
        if (!active) return;
        setSource(fallbackPortrait);
        setMediaFailed(true);
      });
    return () => { active = false; };
  }, [client, dramaId, storyRevision]);

  async function regenerate() {
    setBusy(true);
    setMessage(null);
    try {
      const next = await client.generate(dramaId);
      setSnapshot(next);
      if (next.status === 'ready') {
        setSource(await client.source(dramaId));
        setMediaFailed(false);
      }
      setMessage(t('Portrait updated from the current story.', 'Đã cập nhật chân dung theo cốt truyện hiện tại.'));
    } catch (error) {
      setMessage(portraitMessage(error, t));
    } finally {
      setBusy(false);
    }
  }

  const needsRefresh = client.configured && (snapshot?.status !== 'ready' || mediaFailed);
  const statusLabel = !client.configured
    ? t('Preview', 'Bản xem trước')
    : mediaFailed
      ? t('Fallback image', 'Ảnh dự phòng')
      : snapshot?.status === 'ready'
        ? t('Current', 'Đang khớp')
        : snapshot?.status === 'stale'
          ? t('Story changed', 'Cốt truyện đã đổi')
          : snapshot?.status === 'generating'
            ? t('Updating', 'Đang cập nhật')
            : t('Optional', 'Tùy chọn');

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          {showStageLabel ? <Eyebrow>{t('05 · Living character', '05 · Nhân vật sống')}</Eyebrow> : null}
          <Text style={styles.name}>{characterName}</Text>
        </View>
        <Pill tone={snapshot?.status === 'ready' && !mediaFailed ? 'success' : 'neutral'}>{statusLabel}</Pill>
      </View>
      <View style={styles.portraitFrame}>
        <Image
          source={source}
          style={styles.portrait}
          resizeMode="cover"
          onError={() => {
            setSource(fallbackPortrait);
            setMediaFailed(true);
          }}
          accessibilityLabel={t(`Current portrait of ${characterName}`, `Chân dung hiện tại của ${characterName}`)}
        />
        <View pointerEvents="none" style={styles.portraitInnerFrame} />
        <Text pointerEvents="none" style={[styles.portraitCorner, styles.portraitCornerTopLeft]}>❧</Text>
        <Text pointerEvents="none" style={[styles.portraitCorner, styles.portraitCornerTopRight]}>❧</Text>
        <Text pointerEvents="none" style={[styles.portraitCorner, styles.portraitCornerBottomLeft]}>❧</Text>
        <Text pointerEvents="none" style={[styles.portraitCorner, styles.portraitCornerBottomRight]}>❧</Text>
      </View>
      <Text style={styles.detail}>{t('The profile can evolve with the current canonical story while preserving the previous portrait as an identity reference.', 'Chân dung có thể thay đổi theo cốt truyện chuẩn hiện tại và dùng ảnh trước làm tham chiếu để giữ nhận diện nhân vật.')}</Text>
      {needsRefresh ? (
        <ActionButton
          label={mediaFailed
            ? t('Reload portrait', 'Tải lại chân dung')
            : snapshot?.status === 'stale'
              ? t('Update portrait', 'Cập nhật chân dung')
              : t('Generate portrait', 'Tạo chân dung')}
          variant="secondary"
          busy={busy || snapshot?.status === 'generating'}
          onPress={() => void regenerate()}
        />
      ) : null}
      {mediaFailed ? (
        <Text style={styles.message} accessibilityLiveRegion="polite">
          {t('Private portrait media could not be displayed; the branded fallback is shown instead.', 'Không thể hiển thị ảnh chân dung riêng tư; đang dùng ảnh dự phòng.')}
        </Text>
      ) : null}
      {message ? <Text style={styles.message} accessibilityLiveRegion="polite">{message}</Text> : null}
    </View>
  );
}

type Translate = (en: string, vi: string) => string;

function portraitMessage(error: unknown, t: Translate): string {
  if (error instanceof CharacterPortraitClientError) {
    if (error.code === 'provider_unavailable') return t('Portrait generation is temporarily unavailable; the current image remains.', 'Tạo chân dung tạm thời chưa khả dụng; ảnh hiện tại vẫn được giữ.');
    if (error.code === 'auth_required') return t('Sign in before updating the private portrait.', 'Đăng nhập trước khi cập nhật chân dung riêng tư.');
  }
  return t('Portrait could not be updated. The story and current image are unchanged.', 'Không thể cập nhật chân dung. Cốt truyện và ảnh hiện tại không thay đổi.');
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: classical.goldDeep, backgroundColor: colors.surfaceGlass, shadowColor: colors.violetStrong, shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  headerCopy: { flex: 1, gap: spacing.xs },
  name: { color: colors.ink, fontFamily: typography.display, fontSize: 24, lineHeight: 29, fontWeight: '700' },
  portraitFrame: { position: 'relative', overflow: 'hidden', width: '100%', aspectRatio: 1.35, borderRadius: radius.lg, borderWidth: 1, borderColor: classical.goldDeep, backgroundColor: colors.surfaceWarmDeep },
  portrait: { width: '100%', height: '100%' },
  portraitInnerFrame: { position: 'absolute', top: 5, right: 5, bottom: 5, left: 5, borderWidth: StyleSheet.hairlineWidth, borderColor: classical.hairline, borderRadius: Math.max(1, radius.lg - 4) },
  portraitCorner: { position: 'absolute', color: classical.goldPale, fontFamily: typography.display, fontSize: 18, lineHeight: 20, textShadowColor: colors.background, textShadowRadius: 4 },
  portraitCornerTopLeft: { top: 8, left: 9 },
  portraitCornerTopRight: { top: 8, right: 9, transform: [{ rotate: '90deg' }] },
  portraitCornerBottomLeft: { bottom: 8, left: 9, transform: [{ rotate: '-90deg' }] },
  portraitCornerBottomRight: { right: 9, bottom: 8, transform: [{ rotate: '180deg' }] },
  detail: { color: colors.inkMuted, fontSize: 12, lineHeight: 18 },
  message: { color: colors.quietInk, fontSize: 11, lineHeight: 17 },
});
