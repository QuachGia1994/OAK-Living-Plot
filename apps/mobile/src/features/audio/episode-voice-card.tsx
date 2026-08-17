import { useEffect, useMemo, useRef, useState } from 'react';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { StyleSheet, Text, View } from 'react-native';
import { useUiCopy } from '@/features/localization/ui-copy';
import { useUserPreferences } from '@/features/preferences/preferences-context';
import { createStoryRequestKey } from '@/features/story/request-key';
import { ActionButton, Eyebrow, Pill } from '@/ui/primitives';
import { colors, radius, spacing, typography } from '@/ui/theme';
import type { EpisodeAudioAsset } from './contracts';
import { EpisodeAudioClientError } from './contracts';
import { useEpisodeAudioClient } from './audio-client-context';

export function EpisodeVoiceCard({ episodeId }: { episodeId: string }) {
  const client = useEpisodeAudioClient();
  const { locale, t } = useUiCopy();
  const { preferences } = useUserPreferences();
  const voiceVariant = useMemo(() => preferences.narratorVariant, [preferences.narratorVariant]);
  const reservationKey = useRef(createStoryRequestKey('voice'));
  const loadedAssetId = useRef<string | null>(null);
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const playerStatus = useAudioPlayerStatus(player);
  const [asset, setAsset] = useState<EpisodeAudioAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusRetryNeeded, setStatusRetryNeeded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!asset || !isPending(asset.status)) return;
    let active = true;
    const timer = setTimeout(() => {
      void client.loadStatus(asset.id)
        .then((next) => {
          if (!active) return;
          setAsset(next);
          setStatusRetryNeeded(false);
        })
        .catch((caught: unknown) => {
          if (!active) return;
          setError(audioMessage(caught, locale));
          setStatusRetryNeeded(true);
        });
    }, 1_800);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [asset, client, locale]);

  useEffect(() => {
    if (!asset || asset.status !== 'ready' || loadedAssetId.current === asset.id) return;
    let active = true;
    void client.playbackSource(asset.id)
      .then((source) => {
        if (!active) return;
        player.replace(source);
        loadedAssetId.current = asset.id;
      })
      .catch((caught: unknown) => {
        if (active) setError(audioMessage(caught, locale));
      });
    return () => {
      active = false;
    };
  }, [asset, client, locale, player]);

  async function requestVoice() {
    if (!client.configured) {
      setError(t('Voice is not connected in this preview build yet. You can still read the full episode.', 'Giọng đọc chưa được kết nối trong bản xem trước. Bạn vẫn có thể đọc toàn bộ tập.'));
      return;
    }
    if (asset?.status === 'failed') reservationKey.current = createStoryRequestKey('voice');
    setBusy(true);
    setStatusRetryNeeded(false);
    setError(null);
    try {
      setAsset(await client.request(episodeId, voiceVariant, reservationKey.current));
    } catch (caught) {
      if (isDefiniteVoiceRequestFailure(caught)) reservationKey.current = createStoryRequestKey('voice');
      setError(audioMessage(caught, locale));
    } finally {
      setBusy(false);
    }
  }

  async function refreshStatus() {
    if (!asset) return;
    setBusy(true);
    setError(null);
    try {
      setAsset(await client.loadStatus(asset.id));
      setStatusRetryNeeded(false);
    } catch (caught) {
      setError(audioMessage(caught, locale));
      setStatusRetryNeeded(true);
    } finally {
      setBusy(false);
    }
  }

  function togglePlayback() {
    if (!asset || asset.status !== 'ready' || !playerStatus.isLoaded) return;
    if (playerStatus.playing) player.pause();
    else player.play();
  }

  async function replay() {
    if (!playerStatus.isLoaded) return;
    await player.seekTo(0);
    player.play();
  }

  const progress = playerStatus.duration > 0 ? Math.min(1, playerStatus.currentTime / playerStatus.duration) : 0;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Eyebrow>{t('Episode voice', 'Giọng đọc tập')}</Eyebrow>
          <Text style={styles.title}>{t('Hear the scene narrated', 'Nghe cảnh được kể lại')}</Text>
        </View>
        <Pill tone={asset?.status === 'ready' ? 'success' : 'neutral'}>{voiceLabel(asset, locale)}</Pill>
      </View>

      <Text style={styles.body}>
        {t('Generate narration once, then replay it anytime without using another fresh-voice slot.', 'Tạo giọng đọc một lần rồi phát lại bất kỳ lúc nào mà không dùng thêm lượt giọng mới.')}
      </Text>

      {asset?.status === 'ready' ? (
        <>
          <View
            style={styles.track}
            accessibilityRole="progressbar"
            accessibilityLabel={t('Voice playback progress', 'Tiến độ phát giọng đọc')}
            accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
          >
            <View style={[styles.trackFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <Text style={styles.time}>{formatTime(playerStatus.currentTime)} / {formatTime(playerStatus.duration)}</Text>
          <View style={styles.actions}>
            <ActionButton
              label={playerStatus.playing ? t('Pause voice', 'Tạm dừng giọng đọc') : t('Play voice', 'Phát giọng đọc')}
              variant="secondary"
              disabled={!playerStatus.isLoaded}
              onPress={togglePlayback}
              style={styles.flexButton}
            />
            <ActionButton label={t('Replay', 'Phát lại')} variant="ghost" disabled={!playerStatus.isLoaded} onPress={() => void replay()} />
          </View>
        </>
      ) : (
        <ActionButton
          label={asset && isPending(asset.status)
            ? statusRetryNeeded ? t('Check voice status', 'Kiểm tra trạng thái giọng') : t('Preparing voice…', 'Đang chuẩn bị giọng…')
            : asset?.status === 'failed' ? t('Retry voice', 'Thử lại giọng đọc') : t('Generate voice', 'Tạo giọng đọc')}
          variant="secondary"
          busy={busy}
          disabled={Boolean(asset && isPending(asset.status) && !statusRetryNeeded)}
          onPress={() => void (asset && isPending(asset.status) ? refreshStatus() : requestVoice())}
        />
      )}

      {error ? <Text style={styles.error} accessibilityLiveRegion="assertive">{error}</Text> : null}
    </View>
  );
}

function isPending(status: EpisodeAudioAsset['status']): boolean {
  return status === 'reserving' || status === 'queued' || status === 'processing' || status === 'staged';
}

function voiceLabel(asset: EpisodeAudioAsset | null, locale: 'en' | 'vi'): string {
  const vi = locale === 'vi';
  if (!asset) return vi ? 'Tùy chọn' : 'Optional';
  if (asset.status === 'ready') return asset.cached ? (vi ? 'Đã lưu' : 'Cached') : (vi ? 'Sẵn sàng' : 'Ready');
  if (asset.status === 'failed') return vi ? 'Có thể thử lại' : 'Retry available';
  return vi ? 'Đang tạo' : 'Generating';
}

function isDefiniteVoiceRequestFailure(error: unknown): boolean {
  return error instanceof EpisodeAudioClientError && (
    error.code === 'quota_exceeded' || error.code === 'queue_unavailable' || error.code === 'audio_unavailable'
  );
}

function audioMessage(error: unknown, locale: 'en' | 'vi'): string {
  const vi = locale === 'vi';
  if (!(error instanceof EpisodeAudioClientError)) return vi ? 'Không thể chuẩn bị giọng đọc. Bạn vẫn có thể đọc tập bình thường.' : 'Voice could not be prepared. You can keep reading the episode normally.';
  if (error.code === 'quota_exceeded') return vi ? 'Bạn đã dùng lượt giọng mới hôm nay. Bản đã tạo vẫn có thể phát lại.' : 'You have used today’s fresh narration. Existing narration can still replay.';
  if (error.code === 'auth_required') return vi ? 'Đăng nhập lại trước khi tạo giọng đọc.' : 'Sign in again before generating narration.';
  if (error.code === 'not_configured') return vi ? 'Giọng đọc chưa được kết nối trong bản xem trước.' : 'Voice is not connected in this preview build yet.';
  return error.message;
}

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0:00';
  const seconds = Math.floor(value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  headerCopy: { flex: 1, gap: spacing.xs },
  title: { color: colors.ink, fontFamily: typography.display, fontSize: 21, lineHeight: 27, fontWeight: '700' },
  body: { color: colors.inkMuted, fontSize: 13, lineHeight: 20 },
  track: { height: 5, overflow: 'hidden', borderRadius: radius.pill, backgroundColor: colors.border },
  trackFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.accent },
  time: { color: colors.inkMuted, fontFamily: typography.mono, fontSize: 10, fontWeight: '700', textAlign: 'right' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  flexButton: { flex: 1 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18 },
});
