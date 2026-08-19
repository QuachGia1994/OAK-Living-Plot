import type { Drama } from './domain';

export type PlaybackAction = 'commit_choice' | 'continue' | null;
export type ActivePlaybackAction = Exclude<PlaybackAction, null>;

export interface PlaybackActionLock {
  current: PlaybackAction;
}

export function tryAcquirePlaybackAction(lock: PlaybackActionLock, action: ActivePlaybackAction): boolean {
  if (lock.current !== null) return false;
  lock.current = action;
  return true;
}

export function releasePlaybackAction(lock: PlaybackActionLock, action: ActivePlaybackAction): void {
  if (lock.current === action) lock.current = null;
}

export type PlaybackState =
  | { phase: 'restoring' }
  | { phase: 'playing' }
  | { phase: 'choice' }
  | { phase: 'committing_choice' }
  | { phase: 'consequence' }
  | { phase: 'continuing' }
  | { phase: 'failed'; code: string };

export function derivePlaybackState(input: {
  drama: Drama | null;
  sceneComplete: boolean;
  action: PlaybackAction;
  failure?: string | null;
}): PlaybackState {
  if (!input.drama) return input.failure ? { phase: 'failed', code: input.failure } : { phase: 'restoring' };
  if (input.action === 'commit_choice') return { phase: 'committing_choice' };
  if (input.action === 'continue') return { phase: 'continuing' };
  if (input.drama.currentScene.branch.state === 'committed') return { phase: 'consequence' };
  return input.sceneComplete ? { phase: 'choice' } : { phase: 'playing' };
}
