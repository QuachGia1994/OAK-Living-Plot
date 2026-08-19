import { describe, expect, it } from 'vitest';
import type { Drama } from '../src/features/drama/domain';
import {
  derivePlaybackState,
  releasePlaybackAction,
  tryAcquirePlaybackAction,
  type PlaybackActionLock,
} from '../src/features/drama/playback-state';

const openDrama: Drama = {
  id: 'drama-1',
  title: 'The Message',
  premise: 'Mina receives an impossible message.',
  mood: 'mysterious',
  leadCharacter: { id: 'character-1', name: 'Mina', role: 'protagonist' },
  currentScene: {
    id: 'scene-1',
    number: 1,
    title: 'The first turn',
    script: 'Mina hears the message and realizes someone is outside.',
    summary: 'Mina must decide what to do.',
    branch: { state: 'open' },
    choices: [
      { id: 'choice-a', key: 'A', label: 'Open the door', intent: 'confront', consequence: 'The visitor steps inside.' },
      { id: 'choice-b', key: 'B', label: 'Stay silent', intent: 'hide', consequence: 'The visitor leaves a key.' },
      { id: 'choice-c', key: 'C', label: 'Call for help', intent: 'seek ally', consequence: 'An ally answers immediately.' },
    ],
  },
};

describe('drama playback domain', () => {
  it('keeps scene playback separate from the branch decision and continuation transition', () => {
    expect(derivePlaybackState({ drama: openDrama, sceneComplete: false, action: null })).toEqual({ phase: 'playing' });
    expect(derivePlaybackState({ drama: openDrama, sceneComplete: true, action: null })).toEqual({ phase: 'choice' });
    expect(derivePlaybackState({ drama: openDrama, sceneComplete: true, action: 'commit_choice' })).toEqual({ phase: 'committing_choice' });

    const committed: Drama = {
      ...openDrama,
      currentScene: {
        ...openDrama.currentScene,
        branch: { state: 'committed', choiceId: 'choice-b', consequence: 'The visitor leaves a key.' },
      },
    };
    expect(derivePlaybackState({ drama: committed, sceneComplete: true, action: null })).toEqual({ phase: 'consequence' });
    expect(derivePlaybackState({ drama: committed, sceneComplete: true, action: 'continue' })).toEqual({ phase: 'continuing' });
  });

  it('represents restore and failure without inventing provider pipeline stages', () => {
    expect(derivePlaybackState({ drama: null, sceneComplete: false, action: null })).toEqual({ phase: 'restoring' });
    expect(derivePlaybackState({ drama: null, sceneComplete: false, action: null, failure: 'not_found' })).toEqual({
      phase: 'failed',
      code: 'not_found',
    });
  });

  it('treats selected choice as transient until branch is committed', () => {
    expect(openDrama.currentScene.branch.state).toBe('open');
    const selectedId = openDrama.currentScene.choices[2].id;
    expect(selectedId).toBe('choice-c');
    // Selected UI state must not mutate the open branch.
    expect(openDrama.currentScene.branch).toEqual({ state: 'open' });
    const committed: Drama = {
      ...openDrama,
      currentScene: {
        ...openDrama.currentScene,
        branch: { state: 'committed', choiceId: selectedId, consequence: openDrama.currentScene.choices[2].consequence },
      },
    };
    expect(committed.currentScene.branch.state).toBe('committed');
    if (committed.currentScene.branch.state === 'committed') {
      expect(committed.currentScene.branch.choiceId).toBe(selectedId);
    }
  });

  it('keeps committing_choice phase while action is in flight so UI cannot double-lock', () => {
    expect(
      derivePlaybackState({ drama: openDrama, sceneComplete: true, action: 'commit_choice' }),
    ).toEqual({ phase: 'committing_choice' });
    // Even with an open branch, an in-flight commit action owns the transition.
    expect(
      derivePlaybackState({
        drama: {
          ...openDrama,
          currentScene: {
            ...openDrama.currentScene,
            branch: { state: 'committed', choiceId: 'choice-a', consequence: 'x' },
          },
        },
        sceneComplete: true,
        action: 'commit_choice',
      }),
    ).toEqual({ phase: 'committing_choice' });
  });

  it('serializes commit and continue synchronously before React can rerender', () => {
    const lock: PlaybackActionLock = { current: null };

    expect(tryAcquirePlaybackAction(lock, 'commit_choice')).toBe(true);
    expect(tryAcquirePlaybackAction(lock, 'commit_choice')).toBe(false);
    expect(tryAcquirePlaybackAction(lock, 'continue')).toBe(false);

    releasePlaybackAction(lock, 'commit_choice');
    expect(tryAcquirePlaybackAction(lock, 'continue')).toBe(true);
    releasePlaybackAction(lock, 'continue');
    expect(lock.current).toBeNull();
  });
});
