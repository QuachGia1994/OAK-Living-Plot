export type StoryMood = 'tense' | 'romantic' | 'mysterious' | 'hopeful';

export interface PlotDraft {
  premise: string;
  mood: StoryMood;
  characterName: string;
}

export interface StoryChoice {
  id: string;
  key: 'A' | 'B' | 'C';
  label: string;
  intent: string;
  consequence: string;
}

export interface StoryEpisode {
  id: string;
  number: number;
  title: string;
  body: string;
  summary: string;
  status: 'awaiting_choice' | 'choice_committed';
  choices: [StoryChoice, StoryChoice, StoryChoice];
  committedChoiceId?: string;
  committedConsequence?: string;
}

export interface StoryPlotSummary {
  id: string;
  title: string;
  premise: string;
  mood: StoryMood;
  characterName: string;
  updatedLabel: string;
  episodeNumber: number;
  status: 'awaiting_choice' | 'ready_for_next';
  resumeLine: string;
}

export interface DailyStoryPrompt {
  label: string;
  premise: string;
  mood: StoryMood;
  characterName: string;
}

export interface RetentionDisplay {
  currentStreakDays: number;
  choicesMade: number;
  activePlots: number;
  dailyPrompt: DailyStoryPrompt;
}

export interface StoryPlotSession {
  id: string;
  title: string;
  premise: string;
  mood: StoryMood;
  characterName: string;
  episode: StoryEpisode;
}

export interface QuotaDisplay {
  textRemaining: number;
  textLimit: number;
  voiceRemaining: number;
  voiceLimit: number;
  resetLabel: string;
}

export interface StoryHomeSnapshot {
  recentPlots: StoryPlotSummary[];
  quota: QuotaDisplay;
  retention: RetentionDisplay;
}

export interface StoryExperienceClient {
  loadHome(): Promise<StoryHomeSnapshot>;
  createPlot(draft: PlotDraft, creationKey?: string): Promise<StoryPlotSession>;
  loadPlot(plotId: string): Promise<StoryPlotSession>;
  commitChoice(plotId: string, episodeId: string, choiceId: string): Promise<StoryPlotSession>;
  requestNextEpisode(plotId: string): Promise<StoryPlotSession>;
}

export type StoryClientErrorCode =
  | 'not_found'
  | 'choice_conflict'
  | 'choice_required'
  | 'invalid_input'
  | 'auth_required'
  | 'quota_exceeded'
  | 'provider_unavailable'
  | 'backend_unavailable';

export class StoryClientError extends Error {
  constructor(
    public readonly code: StoryClientErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'StoryClientError';
  }
}
