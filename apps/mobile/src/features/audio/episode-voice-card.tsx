import { useEffect, useMemo, useRef, useState } from 'react';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { StyleSheet, Text, View } from 'react-native';
import { createStoryRequestKey } from '@/features/story/request-key';
import { ActionButton, Card, Eyebrow, Pill } from '@/ui/primitives';
import { colors, radius, spacing } from '@/ui/theme';
import type { EpisodeAudioAsset } from './contracts';
import { EpisodeAudioClientError } from './contracts';
import { useEpisodeAudioClient } from './audio-client-context';

export function EpisodeVoiceCard({ episodeId, locale }: { episodeId: string; locale?: string }) {
  const client = useEpisodeAudioClient();
  const voiceVariant = useMemo(() => preferredVoiceVariant(locale), [locale]);
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
          setError(audioMessage(caught));
          setStatusRetryNeeded(true);
        });
    }, 1_800);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [asset, client]);

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
        if (active) setError(audioMessage(caught));
      });
    return () => {
      active = false;
    };
  }, [asset, client, player]);

  async function requestVoice() {
    if (!client.configured) {
      setError('Live voice needs Clerk plus the Living Plot API. Story text remains fully usable in preview mode.');
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
      setError(audioMessage(caught));
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
      setError(audioMessage(caught));
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
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Eyebrow>Private voice</Eyebrow>
          <Text style={styles.title}>Listen to this episode</Text>
        </View>
        <Pill tone={asset?.status === 'ready' ? 'success' : 'neutral'}>{voiceLabel(asset)}</Pill>
      </View>

      <Text style={styles.body}>
        Fresh narration uses server voice quota. Replaying cached audio does not spend another generation slot.
      </Text>

      {asset?.status === 'ready' ? (
        <>
          <View style={styles.track}>
            <View style={[styles.trackFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <Text style={styles.time}>{formatTime(playerStatus.currentTime)} / {formatTime(playerStatus.duration)}</Text>
          <View style={styles.actions}>
            <ActionButton
              label={playerStatus.playing ? 'Pause voice' : 'Play voice'}
              variant="secondary"
              disabled={!playerStatus.isLoaded}
              onPress={togglePlayback}
              style={styles.flexButton}
            />
            <ActionButton label="Replay" variant="ghost" disabled={!playerStatus.isLoaded} onPress={() => void replay()} />
          </View>
        </>
      ) : (
        <ActionButton
          label={asset && isPending(asset.status)
            ? statusRetryNeeded ? 'Check voice status' : 'Preparing voice…'
            : asset?.status === 'failed' ? 'Retry voice' : 'Generate voice'}
          variant="secondary"
          busy={busy}
          disabled={Boolean(asset && isPending(asset.status) && !statusRetryNeeded)}
          onPress={() => void (asset && isPending(asset.status) ? refreshStatus() : requestVoice())}
        />
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Card>
  );
}

function preferredVoiceVariant(locale?: string): string {
  const value = locale?.trim() || Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
  return value.toLowerCase().startsWith('vi') ? 'vi-narrator-female' : 'en-narrator-female';
}

function isPending(status: EpisodeAudioAsset['status']): boolean {
  return status === 'reserving' || status === 'queued' || status === 'processing' || status === 'staged';
}

function voiceLabel(asset: EpisodeAudioAsset | null): string {
  if (!asset) return 'Optional';
  if (asset.status === 'ready') return asset.cached ? 'Cached' : 'Ready';
  if (asset.status === 'failed') return 'Retry available';
  return 'Generating';
}

function isDefiniteVoiceRequestFailure(error: unknown): boolean {
  return error instanceof EpisodeAudioClientError && (
    error.code === 'quota_exceeded' || error.code === 'queue_unavailable' || error.code === 'audio_unavailable'
  );
}

function audioMessage(error: unknown): string {
  if (!(error instanceof EpisodeAudioClientError)) return 'Voice could not be prepared. The text episode is unchanged.';
  if (error.code === 'quota_exceeded') return 'Today’s fresh voice allowance is used up. Cached voice can still replay.';
  if (error.code === 'auth_required') return 'Sign in again before using private voice audio.';
  if (error.code === 'not_configured') return 'Live voice is unavailable in preview mode.';
  return error.message;
}

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0:00';
  const seconds = Math.floor(value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surfaceRaised },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  headerCopy: { flex: 1, gap: spacing.xs },
  title: { color: colors.ink, fontSize: 20, fontWeight: '900' },
  body: { color: colors.inkMuted, fontSize: 13, lineHeight: 20 },
  track: { height: 5, overflow: 'hidden', borderRadius: radius.pill, backgroundColor: colors.border },
  trackFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.accent },
  time: { color: colors.inkMuted, fontSize: 11, fontWeight: '700', textAlign: 'right' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flexButton: { flex: 1 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18 },
});
