export type DramaMood = 'tense' | 'romantic' | 'mysterious' | 'hopeful';
export type ChoiceKey = 'A' | 'B' | 'C';

export interface CharacterIdentity {
  id: string;
  name: string;
  role: 'protagonist';
}

export interface Choice {
  id: string;
  key: ChoiceKey;
  label: string;
  intent: string;
  consequence: string;
}

export type Branch =
  | { state: 'open' }
  | { state: 'committed'; choiceId: string; consequence: string };

export interface Scene {
  id: string;
  number: number;
  title: string;
  script: string;
  summary: string;
  choices: [Choice, Choice, Choice];
  branch: Branch;
}

export interface Drama {
  id: string;
  title: string;
  premise: string;
  mood: DramaMood;
  leadCharacter: CharacterIdentity;
  currentScene: Scene;
}

export type GenerationJob =
  | { state: 'idle' }
  | { state: 'running'; operation: 'first_scene' | 'continuation'; requestKey: string }
  | { state: 'failed'; operation: 'first_scene' | 'continuation'; code: string };

export type MediaAssetStatus = 'queued' | 'processing' | 'ready' | 'failed';

export interface MediaAsset {
  id: string;
  sceneId: string;
  kind: 'voice';
  variant: string;
  status: MediaAssetStatus;
  attempts: number;
  cached: boolean;
  failureCode: string | null;
}
