import type { SceneGenerationUsage } from '../ai/contracts';

export type GenerationAttemptOutcome = 'accepted' | 'rejected';

export interface GenerationAttemptTelemetry {
  provider: string;
  model: string;
  attempt: 1 | 2;
  outcome: GenerationAttemptOutcome;
  usage: SceneGenerationUsage;
}

export interface GenerationTelemetrySink {
  recordGenerationAttempt(event: GenerationAttemptTelemetry): void;
}

export const NOOP_GENERATION_TELEMETRY: GenerationTelemetrySink = {
  recordGenerationAttempt() {},
};
