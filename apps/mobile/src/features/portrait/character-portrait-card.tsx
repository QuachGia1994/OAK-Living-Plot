import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { useUiCopy } from '@/features/localization/ui-copy';
import { ActionButton, Eyebrow, Pill } from '@/ui/primitives';
import { colors, radius, spacing, typography } from '@/ui/theme';
import { CharacterPortraitClientError, type PortraitSnapshot } from './portrait-client';
import { useCharacterPortraitClient } from './portrait-runtime';

const fallbackPortrait = require('../../../assets/living-plot-scene-mina-3d.jpg') as ImageSourcePropType;

export function CharacterPortraitCard({ dramaId, characterName, storyRevision }: { dramaId: string; characterName: string; storyRevision: string }) {
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
          <Eyebrow>{t('Living character', 'Nhân vật sống')}</Eyebrow>
          <Text style={styles.name}>{characterName}</Text>
        </View>
        <Pill tone={snapshot?.status === 'ready' && !mediaFailed ? 'success' : 'neutral'}>{statusLabel}</Pill>
      </View>
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
  card: { gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, backgroundColor: colors.surfaceQuiet },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  headerCopy: { flex: 1, gap: spacing.xs },
  name: { color: colors.ink, fontFamily: typography.display, fontSize: 24, lineHeight: 29, fontWeight: '700' },
  portrait: { width: '100%', aspectRatio: 1.45, borderRadius: radius.lg, backgroundColor: colors.surfaceWarmDeep },
  detail: { color: colors.inkMuted, fontSize: 12, lineHeight: 18 },
  message: { color: colors.quietInk, fontSize: 11, lineHeight: 17 },
});
