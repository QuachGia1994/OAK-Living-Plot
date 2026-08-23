import { describe, expect, it } from 'vitest';
import { buildCharacterProfile } from '../src/features/drama/character-profile';
import type { Drama, DramaHistory } from '../src/features/drama/contracts';

const drama: Drama = {
  id: 'drama-1',
  title: 'The Glass Archive',
  premise: 'A keeper finds a forbidden memory.',
  mood: 'mysterious',
  leadCharacter: { id: 'character-1', name: 'Mina', role: 'protagonist' },
  currentScene: {
    id: 'scene-5',
    number: 5,
    title: 'The Locked Reflection',
    script: 'Mina faces the mirror.',
    summary: 'Mina reaches the sealed mirror.',
    choices: [
      { id: 'choice-a', key: 'A', label: 'Touch it', intent: 'Investigate', consequence: 'The mirror wakes.' },
      { id: 'choice-b', key: 'B', label: 'Leave', intent: 'Retreat', consequence: 'The hall follows.' },
      { id: 'choice-c', key: 'C', label: 'Call out', intent: 'Challenge', consequence: 'A voice answers.' },
    ],
    branch: { state: 'open' },
  },
};

const history: DramaHistory = {
  dramaId: drama.id,
  title: drama.title,
  items: Array.from({ length: 5 }, (_, index) => ({
    sceneId: `scene-${index + 1}`,
    sceneNumber: index + 1,
    title: `Scene ${index + 1}`,
    summary: `Memory ${index + 1}`,
    branchState: index < 4 ? 'committed' as const : 'open' as const,
    choiceKey: index < 4 ? 'A' as const : undefined,
    choiceLabel: index < 4 ? `Choice ${index + 1}` : undefined,
    consequence: index < 4 ? `Consequence ${index + 1}` : undefined,
  })),
};

describe('buildCharacterProfile', () => {
  it('derives the living profile only from canonical drama and history data', () => {
    const profile = buildCharacterProfile(drama, history);

    expect(profile).toMatchObject({
      name: 'Mina',
      role: 'protagonist',
      dramaTitle: 'The Glass Archive',
      currentSceneNumber: 5,
      scenesRemembered: 5,
      choicesMade: 4,
      lastCommittedConsequence: 'Consequence 4',
    });
    expect(profile.recentMemories.map((memory) => memory.sceneNumber)).toEqual([5, 4, 3, 2]);
    expect(profile.recentMemories).toHaveLength(4);
  });

  it('does not merge history belonging to another drama', () => {
    const profile = buildCharacterProfile(drama, { ...history, dramaId: 'another-drama' });

    expect(profile.scenesRemembered).toBe(0);
    expect(profile.choicesMade).toBe(0);
    expect(profile.lastCommittedConsequence).toBeNull();
    expect(profile.recentMemories).toEqual([]);
  });
});
