import type { SceneGenerationInput, SceneGenerator } from '../ai/contracts';
import type { ChoiceKey, DramaMood } from '../domain/drama';
import type { DramaLocale } from '../preferences/contracts';

export interface DramaSummary {
  id: string;
  sceneId: string;
  title: string;
  premise: string;
  mood: DramaMood;
  characterName: string;
  updatedAt: number;
  sceneNumber: number;
  status: 'awaiting_choice' | 'ready_for_next_scene';
  resumeLine: string;
}

export interface DramaDailyPrompt {
  label: string;
  premise: string;
  mood: DramaMood;
  characterName: string;
  resumeDramaId?: string;
}

export interface DramaRetention {
  currentStreakDays: number;
  choicesMade: number;
  activeDramas: number;
  dailyPrompt: DramaDailyPrompt;
}

export interface DramaQuotaDisplay {
  enforced: boolean;
  textEnforced: boolean;
  voiceEnforced: boolean;
  textRemaining: number;
  textLimit: number;
  voiceRemaining: number;
  voiceLimit: number;
  voiceBonusCredits: number;
  resetAt: string;
}

export interface DramaHome {
  recentDramas: DramaSummary[];
  quota: DramaQuotaDisplay;
  retention: DramaRetention;
}

export interface DramaLibrary {
  active: DramaSummary[];
  archived: DramaSummary[];
}

export interface DramaHistoryItem {
  sceneId: string;
  sceneNumber: number;
  title: string;
  summary: string;
  branchState: 'open' | 'committed';
  choiceKey?: ChoiceKey;
  choiceLabel?: string;
  consequence?: string;
}

export interface DramaHistory {
  dramaId: string;
  title: string;
  items: DramaHistoryItem[];
}

export interface DramaCreateInput {
  userId: string;
  creationKey: string;
  generationKey: string;
  premise: string;
  mood: DramaMood;
  characterName: string;
  locale: DramaLocale;
}

export interface DramaGenerateInput {
  userId: string;
  dramaId: string;
  generationKey: string;
}

export interface DramaCommitInput {
  userId: string;
  dramaId: string;
  sceneId: string;
  choiceId: string;
}

export type DramaErrorCode =
  | 'invalid_input'
  | 'not_found'
  | 'creation_conflict'
  | 'choice_required'
  | 'choice_conflict'
  | 'stale_state'
  | 'quota_exceeded'
  | 'provider_unavailable'
  | 'invalid_generation'
  | 'persistence_error';

export interface DramaError {
  code: DramaErrorCode;
  message: string;
  limit?: number;
  utcDay?: string;
  currentStateVersion?: number;
  committedChoiceId?: string;
  providerStatus?: number;
}

export type DramaResult<T> = { ok: true; value: T } | { ok: false; error: DramaError };

export interface CreatedDramaRecord {
  id: string;
  created: boolean;
}

export interface GenerationContext {
  dramaId: string;
  stateVersion: number;
  input: SceneGenerationInput;
}

export interface GenerationJob {
  userId: string;
  dramaId: string;
  generationKey: string;
}

export interface DramaDependencies {
  generator: SceneGenerator;
}
