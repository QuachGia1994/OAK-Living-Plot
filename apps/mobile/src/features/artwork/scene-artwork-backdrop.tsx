import { useEffect, useState } from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { useSceneArtworkClient } from './scene-artwork-runtime';

const fallbackArtwork = require('../../../assets/living-plot-scene-fallback-classical.jpg') as ImageSourcePropType;
const POLL_INTERVAL_MS = 2_000;
const MAX_POLLS = 24;

export function SceneArtworkBackdrop({
  sceneId,
  revision,
  accessibilityLabel,
}: {
  sceneId: string;
  revision: string;
  accessibilityLabel: string;
}) {
  const client = useSceneArtworkClient();
  const artworkKey = `${sceneId}:${revision}`;
  const [source, setSource] = useState<ImageSourcePropType>(fallbackArtwork);
  const [generated, setGenerated] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;

    const loadSource = async () => {
      const nextSource = await client.source(sceneId);
      if (!active) return;
      setSource(nextSource);
      setGenerated(true);
      setLoadedFor(artworkKey);
    };

    const poll = async (): Promise<void> => {
      if (!active || polls >= MAX_POLLS) return;
      polls += 1;
      const snapshot = await client.status(sceneId);
      if (!active) return;
      if (snapshot.status === 'ready' || snapshot.status === 'stale') {
        await loadSource();
        return;
      }
      if (snapshot.status === 'failed') return;
      timer = setTimeout(() => void poll().catch(() => undefined), POLL_INTERVAL_MS);
    };

    const begin = async () => {
      if (!client.configured) return;
      const snapshot = await client.status(sceneId);
      if (!active) return;
      if (snapshot.status === 'ready' || snapshot.status === 'stale') {
        await loadSource();
        return;
      }
      if (snapshot.status === 'missing') {
        const generatedSnapshot = await client.generate(sceneId);
        if (!active) return;
        if (generatedSnapshot.status === 'ready' || generatedSnapshot.status === 'stale') {
          await loadSource();
          return;
        }
      }
      await poll();
    };

    void begin().catch(() => undefined);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [artworkKey, client, sceneId]);

  const currentSource = loadedFor === artworkKey ? source : fallbackArtwork;
  const currentGenerated = loadedFor === artworkKey && generated;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image
        source={currentSource}
        style={styles.image}
        resizeMode="cover"
        accessibilityLabel={accessibilityLabel}
        onError={() => {
          setSource(fallbackArtwork);
          setGenerated(false);
          setLoadedFor(artworkKey);
        }}
      />
      <View style={[styles.patina, currentGenerated && styles.generatedPatina]} />
    </View>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', height: '100%' },
  patina: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(8, 7, 5, 0.22)',
  },
  generatedPatina: { backgroundColor: 'rgba(8, 7, 5, 0.12)' },
});
