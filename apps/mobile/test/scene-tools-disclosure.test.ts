import { describe, expect, it } from 'vitest';
import {
  closedSceneToolsDisclosure,
  sceneToolsRevealSignal,
  toggleSceneToolsDisclosure,
} from '../src/features/drama/scene-tools-disclosure';

describe('scene tools disclosure', () => {
  it('requests a fresh reveal whenever hidden voice and share controls are opened', () => {
    const opened = toggleSceneToolsDisclosure(closedSceneToolsDisclosure());

    expect(opened).toEqual({ expanded: true, revealVersion: 1 });
    expect(sceneToolsRevealSignal(opened, 'scene-2')).toBe('scene-2:1');

    const closed = toggleSceneToolsDisclosure(opened);
    expect(closed).toEqual({ expanded: false, revealVersion: 1 });
    expect(sceneToolsRevealSignal(closed, 'scene-2')).toBeUndefined();

    const reopened = toggleSceneToolsDisclosure(closed);
    expect(reopened).toEqual({ expanded: true, revealVersion: 2 });
    expect(sceneToolsRevealSignal(reopened, 'scene-2')).toBe('scene-2:2');
  });
});
