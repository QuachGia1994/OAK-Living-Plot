import { useEffect, useMemo, useRef, useState } from 'react';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Speech from 'expo-speech';
import { StyleSheet, Text, View } from 'react-native';
import { useUiCopy } from '@/features/localization/ui-copy';
import { useUserPreferences } from '@/features/preferences/preferences-context';
import type { MediaAsset } from '@/features/drama/domain';
import { createIdempotencyKey } from '@/lib/idempotency-key';
import { ActionButton, Pill } from '@/ui/primitives';
import { colors, radius, spacing, typography } from '@/ui/theme';
import { SceneVoiceClientError } from './contracts';
import { useSceneVoiceClient } from './audio-client-context';
import { nextMediaPoll } from './media-polling';

export function SceneVoiceCard({ sceneId, sceneText }: { sceneId: string; sceneText: string }) {
  const client = useSceneVoiceClient();
  const { locale, t } = useUiCopy();
  const { preferences } = useUserPreferences();
  const voiceVariant = useMemo(() => preferences.narratorVariant, [preferences.narratorVariant]);
  const reservationKey = useRef(createIdempotencyKey('voice'));
  const loadedAssetId = useRef<string | null>(null);
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const playerStatus = useAudioPlayerStatus(player);
  const [asset, setAsset] = useState<MediaAsset | null>(null);
  const [autoPollCount, setAutoPollCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [statusRetryNeeded, setStatusRetryNeeded] = useState(false);
  const [deviceSpeaking, setDeviceSpeaking] = useState(false);
  const [deviceSpeechError, setDeviceSpeechError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!asset) return;
    const poll = nextMediaPoll(asset.status, autoPollCount);
    if (!poll) return;
    let active = true;
    const timer = setTimeout(() => {
      void client.loadStatus(asset.id)
        .then((next) => {
          if (!active) return;
          setAsset(next);
          setAutoPollCount((count) => count + 1);
          setStatusRetryNeeded(false);
        })
        .catch((caught: unknown) => {
          if (!active) return;
          setError(audioMessage(caught, locale));
          setStatusRetryNeeded(true);
        });
    }, poll.delayMs);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [asset, autoPollCount, client, locale]);

  useEffect(() => () => {
    void Speech.stop();
  }, [sceneId]);

  useEffect(() => {
    if (asset?.status === 'ready' && deviceSpeaking) {
      void Speech.stop().finally(() => setDeviceSpeaking(false));
    }
  }, [asset?.status, deviceSpeaking]);

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
    if (asset?.status === 'failed') reservationKey.current = createIdempotencyKey('voice');
    setBusy(true);
    setAutoPollCount(0);
    setStatusRetryNeeded(false);
    setError(null);
    try {
      setAsset(await client.request(sceneId, voiceVariant, reservationKey.current));
    } catch (caught) {
      if (isDefiniteVoiceRequestFailure(caught)) reservationKey.current = createIdempotencyKey('voice');
      setError(audioMessage(caught, locale));
    } finally {
      setBusy(false);
    }
  }

  async function refreshStatus() {
    if (!asset) return;
    setBusy(true);
    setAutoPollCount(0);
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

  async function toggleDeviceSpeech() {
    setDeviceSpeechError(null);
    const text = sceneText.normalize('NFC').trim();
    if (!text) {
      setDeviceSpeechError(t('This scene has no readable text.', 'Cảnh này không có văn bản để đọc.'));
      return;
    }
    try {
      if (deviceSpeaking || await Speech.isSpeakingAsync()) {
        await Speech.stop();
        setDeviceSpeaking(false);
        return;
      }
      Speech.speak(text, {
        language: preferences.dramaLocale,
        rate: 0.96,
        onStart: () => setDeviceSpeaking(true),
        onDone: () => setDeviceSpeaking(false),
        onStopped: () => setDeviceSpeaking(false),
        onError: () => {
          setDeviceSpeaking(false);
          setDeviceSpeechError(t('Device voice is unavailable on this phone.', 'Giọng đọc của thiết bị không khả dụng trên máy này.'));
        },
      });
    } catch {
      setDeviceSpeaking(false);
      setDeviceSpeechError(t('Device voice is unavailable on this phone.', 'Giọng đọc của thiết bị không khả dụng trên máy này.'));
    }
  }

  const progress = playerStatus.duration > 0 ? Math.min(1, playerStatus.currentTime / playerStatus.duration) : 0;
  const pollBudgetExhausted = Boolean(asset && isPending(asset.status) && !nextMediaPoll(asset.status, autoPollCount));
  const needsStatusRefresh = statusRetryNeeded || pollBudgetExhausted;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>{t('Voice', 'Giọng đọc')}</Text>
          <Text style={styles.title} numberOfLines={1}>{client.configured ? voiceLabel(asset, locale) : t('Unavailable', 'Chưa khả dụng')}</Text>
        </View>
        <Pill tone={asset?.status === 'ready' ? 'success' : 'neutral'}>{!client.configured ? t('Preview', 'Bản xem trước') : asset?.status === 'ready' ? t('Ready', 'Sẵn sàng') : t('Optional', 'Tùy chọn')}</Pill>
      </View>

      {!client.configured ? (
        <Text style={styles.notice} accessibilityLiveRegion="polite">{t('Voice is unavailable in this preview build. Story text remains fully available.', 'Giọng đọc chưa khả dụng trong bản xem trước này. Bạn vẫn có thể đọc toàn bộ cảnh.')}</Text>
      ) : asset?.status === 'ready' ? (
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
            ? needsStatusRefresh ? t('Check voice status', 'Kiểm tra trạng thái giọng') : t('Preparing voice…', 'Đang chuẩn bị giọng…')
            : asset?.status === 'failed' ? t('Retry voice', 'Thử lại giọng đọc') : t('Generate voice', 'Tạo giọng đọc')}
          variant="secondary"
          busy={busy}
          disabled={Boolean(asset && isPending(asset.status) && !needsStatusRefresh)}
          onPress={() => void (asset && isPending(asset.status) ? refreshStatus() : requestVoice())}
        />
      )}

      {asset?.status !== 'ready' ? (
        <View style={styles.deviceVoiceFallback}>
          <ActionButton
            label={deviceSpeaking ? t('Stop device voice', 'Dừng giọng máy') : t('Read with device voice', 'Đọc bằng giọng máy')}
            variant="ghost"
            onPress={() => void toggleDeviceSpeech()}
          />
          <Text style={styles.deviceVoiceNote}>{t('Uses your phone’s system voice and does not consume a narration slot.', 'Dùng giọng hệ thống trên điện thoại và không tốn lượt giọng đọc.')}</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.notice} accessibilityLiveRegion="polite">{error}</Text> : null}
      {deviceSpeechError ? <Text style={styles.notice} accessibilityLiveRegion="polite">{deviceSpeechError}</Text> : null}
    </View>
  );
}

function isPending(status: MediaAsset['status']): boolean {
  return status === 'queued' || status === 'processing';
}

function voiceLabel(asset: MediaAsset | null, locale: 'en' | 'vi'): string {
  const vi = locale === 'vi';
  if (!asset) return vi ? 'Tùy chọn' : 'Optional';
  if (asset.status === 'ready') return asset.cached ? (vi ? 'Đã lưu' : 'Cached') : (vi ? 'Sẵn sàng' : 'Ready');
  if (asset.status === 'failed') return vi ? 'Có thể thử lại' : 'Retry available';
  if (asset.status === 'queued') return vi ? 'Đang xếp hàng' : 'Queued';
  return vi ? 'Đang xử lý' : 'Processing';
}

function isDefiniteVoiceRequestFailure(error: unknown): boolean {
  return error instanceof SceneVoiceClientError && (
    error.code === 'quota_exceeded' || error.code === 'queue_unavailable' || error.code === 'audio_unavailable'
  );
}

function audioMessage(error: unknown, locale: 'en' | 'vi'): string {
  const vi = locale === 'vi';
  if (!(error instanceof SceneVoiceClientError)) return vi ? 'Không thể chuẩn bị giọng đọc. Bạn vẫn có thể đọc cảnh bình thường.' : 'Voice could not be prepared. You can keep reading the scene normally.';
  if (error.code === 'quota_exceeded') return vi ? 'Bạn đã dùng lượt giọng mới hôm nay. Bản đã tạo vẫn có thể phát lại.' : 'You have used today’s fresh narration. Existing narration can still replay.';
  if (error.code === 'auth_required') return vi ? 'Đăng nhập trước khi tạo hoặc phát giọng đọc.' : 'Sign in before generating or playing narration.';
  if (error.code === 'not_configured') return vi ? 'Giọng đọc chưa khả dụng trong bản xem trước này.' : 'Voice is unavailable in this preview build.';
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
  kicker: { color: colors.quietInk, fontFamily: typography.mono, fontSize: 9, fontWeight: '900', letterSpacing: 1.1, textTransform: 'uppercase' },
  notice: { color: colors.inkMuted, fontSize: 12, lineHeight: 18 },
  deviceVoiceFallback: { gap: spacing.xs },
  deviceVoiceNote: { color: colors.quietInk, fontSize: 11, lineHeight: 16 },
});
