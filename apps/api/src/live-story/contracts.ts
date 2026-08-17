import type { EpisodeGenerationInput, StoryGenerator } from '../ai/contracts';

export type LiveStoryMood = 'tense' | 'romantic' | 'mysterious' | 'hopeful';

export interface LiveStoryChoice {
  id: string;
  key: 'A' | 'B' | 'C';
  label: string;
  intent: string;
  consequence: string;
}

export interface LiveStoryEpisode {
  id: string;
  number: number;
  title: string;
  body: string;
  summary: string;
  status: 'awaiting_choice' | 'choice_committed';
  choices: [LiveStoryChoice, LiveStoryChoice, LiveStoryChoice];
  committedChoiceId?: string;
  committedConsequence?: string;
}

export interface LiveStorySession {
  id: string;
  title: string;
  premise: string;
  mood: LiveStoryMood;
  characterName: string;
  updatedAt: number;
  version: number;
  episode: LiveStoryEpisode;
}

export interface LiveStoryPlotSummary {
  id: string;
  title: string;
  premise: string;
  mood: LiveStoryMood;
  characterName: string;
  updatedAt: number;
  episodeNumber: number;
  status: 'awaiting_choice' | 'ready_for_next';
  resumeLine: string;
}

export interface LiveStoryDailyPrompt {
  label: string;
  premise: string;
  mood: LiveStoryMood;
  characterName: string;
}

export interface LiveStoryRetention {
  currentStreakDays: number;
  choicesMade: number;
  activePlots: number;
  dailyPrompt: LiveStoryDailyPrompt;
}

export interface LiveStoryQuotaDisplay {
  textRemaining: number;
  textLimit: number;
  voiceRemaining: number;
  voiceLimit: number;
  resetAt: string;
}

export interface LiveStoryHome {
  recentPlots: LiveStoryPlotSummary[];
  quota: LiveStoryQuotaDisplay;
  retention: LiveStoryRetention;
}

export interface LiveStoryLibrary {
  active: LiveStoryPlotSummary[];
  archived: LiveStoryPlotSummary[];
}

export interface LiveStoryHistoryItem {
  episodeId: string;
  episodeNumber: number;
  title: string;
  summary: string;
  status: 'awaiting_choice' | 'choice_committed';
  choiceKey?: 'A' | 'B' | 'C';
  choiceLabel?: string;
  consequence?: string;
}

export interface LiveStoryHistory {
  plotId: string;
  title: string;
  items: LiveStoryHistoryItem[];
}

export interface LiveStoryCreateInput {
  userId: string;
  creationKey: string;
  generationKey: string;
  premise: string;
  mood: LiveStoryMood;
  characterName: string;
  locale: string;
}

export interface LiveStoryGenerateInput {
  userId: string;
  plotId: string;
  generationKey: string;
}

export interface LiveStoryCommitInput {
  userId: string;
  plotId: string;
  episodeId: string;
  choiceId: string;
}

export type LiveStoryErrorCode =
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

export interface LiveStoryError {
  code: LiveStoryErrorCode;
  message: string;
  limit?: number;
  utcDay?: string;
  currentStateVersion?: number;
  committedChoiceId?: string;
}

export type LiveStoryResult<T> = { ok: true; value: T } | { ok: false; error: LiveStoryError };

export interface CreatedPlotRecord {
  id: string;
  created: boolean;
}

export interface GenerationContext {
  plotId: string;
  stateVersion: number;
  input: EpisodeGenerationInput;
}

export interface LiveStoryDependencies {
  generator: StoryGenerator;
}
