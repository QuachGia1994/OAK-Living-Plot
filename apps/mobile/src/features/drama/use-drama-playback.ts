import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRefreshOnForeground } from '@/lib/use-refresh-on-foreground';
import { DramaClientError, type DramaClientErrorCode } from './contracts';
import type { Drama } from './domain';
import { useDramaExperienceClient } from './drama-client-context';
import { derivePlaybackState, type PlaybackAction } from './playback-state';

export type DramaFailureSource = 'load' | 'refresh' | 'commit_choice' | 'continue';

export interface DramaFailure {
  source: DramaFailureSource;
  code: DramaClientErrorCode | 'unknown';
}

export function useDramaPlayback(input: { dramaId: string | null; enabled: boolean }) {
  const client = useDramaExperienceClient();
  const currentSceneId = useRef<string | null>(null);
  const [drama, setDrama] = useState<Drama | null>(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [sceneComplete, setSceneComplete] = useState(false);
  const [action, setAction] = useState<PlaybackAction>(null);
  const [failure, setFailure] = useState<DramaFailure | null>(null);
  const [loading, setLoading] = useState(true);

  const adoptDrama = useCallback((next: Drama) => {
    const sceneChanged = currentSceneId.current !== next.currentScene.id;
    currentSceneId.current = next.currentScene.id;
    setDrama(next);
    setSelectedChoiceId(null);
    if (sceneChanged) setSceneComplete(next.currentScene.branch.state === 'committed');
  }, []);

  const load = useCallback(async () => {
    if (!input.dramaId) {
      setFailure({ source: 'load', code: 'not_found' });
      setLoading(false);
      return;
    }
    setLoading(true);
    setFailure(null);
    try {
      adoptDrama(await client.loadDrama(input.dramaId));
    } catch (error) {
      setFailure(toFailure('load', error));
    } finally {
      setLoading(false);
    }
  }, [adoptDrama, client, input.dramaId]);

  const refresh = useCallback(async () => {
    if (!input.enabled || !input.dramaId) return;
    try {
      adoptDrama(await client.loadDrama(input.dramaId));
      setFailure(null);
    } catch (error) {
      setFailure(toFailure('refresh', error));
    }
  }, [adoptDrama, client, input.dramaId, input.enabled]);

  useRefreshOnForeground(refresh);

  useEffect(() => {
    if (!input.enabled) return;
    let active = true;
    setLoading(true);
    setFailure(null);
    if (!input.dramaId) {
      setFailure({ source: 'load', code: 'not_found' });
      setLoading(false);
      return;
    }
    void client.loadDrama(input.dramaId)
      .then((next) => {
        if (active) adoptDrama(next);
      })
      .catch((error: unknown) => {
        if (active) setFailure(toFailure('load', error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [adoptDrama, client, input.dramaId, input.enabled]);

  const commitChoice = useCallback(async () => {
    if (!drama || !selectedChoiceId || action) return;
    setAction('commit_choice');
    setFailure(null);
    try {
      adoptDrama(await client.commitChoice(drama.id, drama.currentScene.id, selectedChoiceId));
      setSceneComplete(true);
    } catch (error) {
      setFailure(toFailure('commit_choice', error));
    } finally {
      setAction(null);
    }
  }, [action, adoptDrama, client, drama, selectedChoiceId]);

  const continueDrama = useCallback(async () => {
    if (!drama || action || drama.currentScene.branch.state !== 'committed') return;
    setAction('continue');
    setFailure(null);
    try {
      adoptDrama(await client.requestNextScene(drama.id));
    } catch (error) {
      setFailure(toFailure('continue', error));
    } finally {
      setAction(null);
    }
  }, [action, adoptDrama, client, drama]);

  const markSceneComplete = useCallback(() => setSceneComplete(true), []);

  const playbackState = useMemo(() => derivePlaybackState({
    drama,
    sceneComplete,
    action,
    failure: !drama ? failure?.code ?? null : null,
  }), [action, drama, failure, sceneComplete]);

  return {
    drama,
    loading,
    selectedChoiceId,
    selectedChoice: drama?.currentScene.choices.find((choice) => choice.id === selectedChoiceId) ?? null,
    failure,
    playbackState,
    selectChoice: setSelectedChoiceId,
    markSceneComplete,
    load,
    commitChoice,
    continueDrama,
  };
}

function toFailure(source: DramaFailureSource, error: unknown): DramaFailure {
  return {
    source,
    code: error instanceof DramaClientError ? error.code : 'unknown',
  };
}
