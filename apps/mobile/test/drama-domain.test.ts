import { describe, expect, it } from 'vitest';
import type { Drama } from '../src/features/drama/domain';
import { derivePlaybackState } from '../src/features/drama/playback-state';

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
});
