import type { PlaybackState } from './playback-state';

export type SceneSheet = 'scene' | 'choice' | 'consequence';
export type SceneSheetDirection = 'previous' | 'next';

const SHEETS: SceneSheet[] = ['scene', 'choice', 'consequence'];

export function liveSceneSheet(phase: PlaybackState['phase']): SceneSheet {
  if (phase === 'choice' || phase === 'committing_choice') return 'choice';
  if (phase === 'consequence' || phase === 'continuing') return 'consequence';
  return 'scene';
}

export function canViewSceneSheet(target: SceneSheet, live: SceneSheet): boolean {
  return SHEETS.indexOf(target) <= SHEETS.indexOf(live);
}

export function moveSceneSheet(current: SceneSheet, live: SceneSheet, direction: SceneSheetDirection): SceneSheet {
  const currentIndex = SHEETS.indexOf(current);
  const liveIndex = SHEETS.indexOf(live);
  if (direction === 'previous') return SHEETS[Math.max(0, currentIndex - 1)];
  return SHEETS[Math.min(liveIndex, currentIndex + 1)];
}

export function sceneSheetAfterSwipe(
  current: SceneSheet,
  live: SceneSheet,
  dx: number,
  dy: number,
  threshold = 54,
): SceneSheet {
  const horizontal = Math.abs(dx);
  if (horizontal < threshold || horizontal <= Math.abs(dy) * 1.2) return current;
  return moveSceneSheet(current, live, dx > 0 ? 'previous' : 'next');
}
