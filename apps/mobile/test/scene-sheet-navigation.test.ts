import { describe, expect, it } from 'vitest';
import {
  canViewSceneSheet,
  liveSceneSheet,
  moveSceneSheet,
  sceneSheetAfterSwipe,
} from '../src/features/drama/scene-sheet-navigation';

describe('scene sheet navigation', () => {
  it('maps canonical playback phases to the furthest reviewable sheet', () => {
    expect(liveSceneSheet('playing')).toBe('scene');
    expect(liveSceneSheet('choice')).toBe('choice');
    expect(liveSceneSheet('committing_choice')).toBe('choice');
    expect(liveSceneSheet('consequence')).toBe('consequence');
    expect(liveSceneSheet('continuing')).toBe('consequence');
  });

  it('never moves beyond canonical live progress', () => {
    expect(canViewSceneSheet('choice', 'scene')).toBe(false);
    expect(moveSceneSheet('scene', 'scene', 'next')).toBe('scene');
    expect(moveSceneSheet('scene', 'choice', 'next')).toBe('choice');
    expect(moveSceneSheet('choice', 'consequence', 'next')).toBe('consequence');
  });

  it('uses horizontal swipes to review sheets without invoking route back', () => {
    expect(sceneSheetAfterSwipe('consequence', 'consequence', 90, 5)).toBe('choice');
    expect(sceneSheetAfterSwipe('choice', 'consequence', 90, 5)).toBe('scene');
    expect(sceneSheetAfterSwipe('scene', 'consequence', -90, 5)).toBe('choice');
    expect(sceneSheetAfterSwipe('choice', 'consequence', -90, 5)).toBe('consequence');
    expect(sceneSheetAfterSwipe('choice', 'consequence', 10, 80)).toBe('choice');
  });
});
