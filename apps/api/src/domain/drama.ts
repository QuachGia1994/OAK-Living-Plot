export type DramaMood = 'tense' | 'romantic' | 'mysterious' | 'hopeful';

export function isDramaMood(value: unknown): value is DramaMood {
  return value === 'tense' || value === 'romantic' || value === 'mysterious' || value === 'hopeful';
}
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
  updatedAt: number;
  version: number;
  currentScene: Scene;
}
