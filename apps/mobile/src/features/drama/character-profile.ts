import type { Drama, DramaHistory } from './contracts';

export interface CharacterMemory {
  sceneId: string;
  sceneNumber: number;
  title: string;
  summary: string;
  choiceLabel: string | null;
  consequence: string | null;
}

export interface CharacterProfile {
  name: string;
  role: Drama['leadCharacter']['role'];
  mood: Drama['mood'];
  dramaTitle: string;
  premise: string;
  currentSceneNumber: number;
  currentSceneTitle: string;
  scenesRemembered: number;
  choicesMade: number;
  lastCommittedConsequence: string | null;
  recentMemories: CharacterMemory[];
}

const RECENT_MEMORY_LIMIT = 4;

export function buildCharacterProfile(drama: Drama, history: DramaHistory): CharacterProfile {
  const canonicalItems = history.dramaId === drama.id ? history.items : [];
  const committedItems = canonicalItems.filter((item) => item.branchState === 'committed');
  const lastCommitted = committedItems[committedItems.length - 1];

  return {
    name: drama.leadCharacter.name,
    role: drama.leadCharacter.role,
    mood: drama.mood,
    dramaTitle: drama.title,
    premise: drama.premise,
    currentSceneNumber: drama.currentScene.number,
    currentSceneTitle: drama.currentScene.title,
    scenesRemembered: canonicalItems.length,
    choicesMade: committedItems.length,
    lastCommittedConsequence: lastCommitted?.consequence ?? null,
    recentMemories: canonicalItems
      .slice(-RECENT_MEMORY_LIMIT)
      .reverse()
      .map((item) => ({
        sceneId: item.sceneId,
        sceneNumber: item.sceneNumber,
        title: item.title,
        summary: item.summary,
        choiceLabel: item.choiceLabel ?? null,
        consequence: item.consequence ?? null,
      })),
  };
}
