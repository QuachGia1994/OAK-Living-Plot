import type { StoryGenerationUsage } from '../ai/contracts';

export type StoryGenerationAttemptOutcome = 'accepted' | 'rejected';

export interface StoryGenerationAttemptTelemetry {
  provider: 'gemini';
  model: string;
  attempt: 1 | 2;
  outcome: StoryGenerationAttemptOutcome;
  usage: StoryGenerationUsage;
}

export interface StoryTelemetrySink {
  recordGenerationAttempt(event: StoryGenerationAttemptTelemetry): void;
}

export const NOOP_STORY_TELEMETRY: StoryTelemetrySink = {
  recordGenerationAttempt() {},
};
