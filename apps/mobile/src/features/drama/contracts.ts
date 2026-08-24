import type { Drama, DramaMood } from '@/features/drama/domain';

export type { Drama, DramaMood, Choice, Branch, CharacterIdentity, Scene } from '@/features/drama/domain';

export interface DramaDraft {
  premise: string;
  mood: DramaMood;
  characterName: string;
}

export interface DramaSeedSuggestionInput {
  mood: DramaMood;
  characterName?: string;
  inspiration?: string;
}

export interface DramaSeedSuggestion {
  label: string;
  premise: string;
  mood: DramaMood;
  characterName: string;
}

export type DramaSeedSuggestionBatch = [DramaSeedSuggestion, DramaSeedSuggestion, DramaSeedSuggestion];

export interface DramaSummary {
  id: string;
  sceneId: string;
  title: string;
  premise: string;
  mood: DramaMood;
  characterName: string;
  updatedLabel: string;
  sceneNumber: number;
  status: 'awaiting_choice' | 'ready_for_next_scene';
  resumeLine: string;
}

export interface DailyDramaPrompt {
  label: string;
  premise: string;
  mood: DramaMood;
  characterName: string;
  resumeDramaId?: string;
}

export interface RetentionDisplay {
  currentStreakDays: number;
  choicesMade: number;
  activeDramas: number;
  dailyPrompt: DailyDramaPrompt;
}

export interface QuotaDisplay {
  enforced: boolean;
  textEnforced: boolean;
  voiceEnforced: boolean;
  textRemaining: number;
  textLimit: number;
  voiceRemaining: number;
  voiceLimit: number;
  voiceBonusCredits: number;
  resetLabel: string;
}

export interface DramaHomeSnapshot {
  recentDramas: DramaSummary[];
  quota: QuotaDisplay;
  retention: RetentionDisplay;
}

export interface DramaLibrarySnapshot {
  active: DramaSummary[];
  archived: DramaSummary[];
}

export interface DramaHistoryItem {
  sceneId: string;
  sceneNumber: number;
  title: string;
  summary: string;
  branchState: 'open' | 'committed';
  choiceKey?: 'A' | 'B' | 'C';
  choiceLabel?: string;
  consequence?: string;
}

export interface DramaHistory {
  dramaId: string;
  title: string;
  items: DramaHistoryItem[];
}

export interface DramaExperienceClient {
  loadHome(): Promise<DramaHomeSnapshot>;
  loadLibrary(): Promise<DramaLibrarySnapshot>;
  createDrama(draft: DramaDraft, creationKey?: string, firstGenerationKey?: string): Promise<Drama>;
  suggestDramaSeeds(input: DramaSeedSuggestionInput, requestKey: string): Promise<DramaSeedSuggestionBatch>;
  loadDrama(dramaId: string): Promise<Drama>;
  loadHistory(dramaId: string): Promise<DramaHistory>;
  archiveDrama(dramaId: string): Promise<DramaSummary>;
  restoreDrama(dramaId: string): Promise<DramaSummary>;
  commitChoice(dramaId: string, sceneId: string, choiceId: string): Promise<Drama>;
  requestNextScene(dramaId: string): Promise<Drama>;
}

export type DramaClientErrorCode =
  | 'not_found'
  | 'choice_conflict'
  | 'choice_required'
  | 'invalid_input'
  | 'auth_required'
  | 'quota_exceeded'
  | 'provider_unavailable'
  | 'invalid_generation'
  | 'suggestion_conflict'
  | 'suggestion_in_progress'
  | 'suggestion_rate_limited'
  | 'invalid_suggestion_response'
  | 'suggestion_unavailable'
  | 'backend_unavailable';

export class DramaClientError extends Error {
  constructor(
    public readonly code: DramaClientErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DramaClientError';
  }
}
