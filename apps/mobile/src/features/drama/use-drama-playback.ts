import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRefreshOnForeground } from '@/lib/use-refresh-on-foreground';
import { DramaClientError, type DramaClientErrorCode } from './contracts';
import type { Drama } from './domain';
import { useDramaExperienceClient } from './drama-client-context';
import {
  derivePlaybackState,
  releasePlaybackAction,
  shouldResetTransientPlayback,
  tryAcquirePlaybackAction,
  type PlaybackAction,
} from './playback-state';

export type DramaFailureSource = 'load' | 'refresh' | 'commit_choice' | 'continue';

export interface DramaFailure {
  source: DramaFailureSource;
  code: DramaClientErrorCode | 'unknown';
}

export function useDramaPlayback(input: { dramaId: string | null; enabled: boolean }) {
  const client = useDramaExperienceClient();
  const dramaRef = useRef<Drama | null>(null);
  const loadVersion = useRef(0);
  const actionLock = useRef<PlaybackAction>(null);
  const [drama, setDrama] = useState<Drama | null>(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [sceneComplete, setSceneComplete] = useState(false);
  const [action, setAction] = useState<PlaybackAction>(null);
  const [failure, setFailure] = useState<DramaFailure | null>(null);
  const [loading, setLoading] = useState(true);

  const adoptDrama = useCallback((next: Drama) => {
    const previous = dramaRef.current;
    const resetTransient = shouldResetTransientPlayback(previous, next);
    dramaRef.current = next;
    setDrama(next);
    if (resetTransient) {
      setSelectedChoiceId(null);
      setSceneComplete(next.currentScene.branch.state === 'committed');
    }
  }, []);

  const load = useCallback(async () => {
    const requestVersion = ++loadVersion.current;
    if (!input.dramaId) {
      setFailure({ source: 'load', code: 'not_found' });
      setLoading(false);
      return;
    }
    const sameDramaAlreadyVisible = dramaRef.current?.id === input.dramaId;
    if (!sameDramaAlreadyVisible) {
      dramaRef.current = null;
      setDrama(null);
      setSelectedChoiceId(null);
      setSceneComplete(false);
      setLoading(true);
    }
    setFailure(null);
    try {
      const next = await client.loadDrama(input.dramaId);
      if (requestVersion === loadVersion.current) adoptDrama(next);
    } catch (error) {
      if (requestVersion === loadVersion.current) setFailure(toFailure('load', error));
    } finally {
      if (requestVersion === loadVersion.current) setLoading(false);
    }
  }, [adoptDrama, client, input.dramaId]);

  const refresh = useCallback(async () => {
    if (!input.enabled || !input.dramaId || actionLock.current !== null) return;
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
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => {
      clearTimeout(timer);
      loadVersion.current += 1;
    };
  }, [input.enabled, load]);

  const commitChoice = useCallback(async () => {
    if (!drama || !selectedChoiceId || !tryAcquirePlaybackAction(actionLock, 'commit_choice')) return;
    setAction('commit_choice');
    setFailure(null);
    try {
      adoptDrama(await client.commitChoice(drama.id, drama.currentScene.id, selectedChoiceId));
      setSceneComplete(true);
    } catch (error) {
      setFailure(toFailure('commit_choice', error));
    } finally {
      releasePlaybackAction(actionLock, 'commit_choice');
      setAction(null);
    }
  }, [adoptDrama, client, drama, selectedChoiceId]);

  const continueDrama = useCallback(async () => {
    if (!drama || drama.currentScene.branch.state !== 'committed' || !tryAcquirePlaybackAction(actionLock, 'continue')) return;
    setAction('continue');
    setFailure(null);
    try {
      adoptDrama(await client.requestNextScene(drama.id));
    } catch (error) {
      setFailure(toFailure('continue', error));
    } finally {
      releasePlaybackAction(actionLock, 'continue');
      setAction(null);
    }
  }, [adoptDrama, client, drama]);

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
