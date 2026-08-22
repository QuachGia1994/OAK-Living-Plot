import type { SceneGenerationUsage } from '../ai/contracts';

export type GenerationAttemptOutcome = 'accepted' | 'rejected';

export interface GenerationAttemptTelemetry {
  provider: string;
  model: string;
  attempt: 1 | 2;
  outcome: GenerationAttemptOutcome;
  usage: SceneGenerationUsage;
}

export interface GenerationPipelineTelemetry {
  provider: string;
  model: string;
  providerCalls: number;
  repairs: number;
  outcome: 'accepted' | 'invalid_response' | 'provider_error';
  timings: {
    providerMs: number;
    parseMs: number;
    compileMs: number;
    validateMs: number;
    totalMs: number;
  };
}

export interface GenerationTelemetrySink {
  recordGenerationAttempt(event: GenerationAttemptTelemetry): void;
  recordGenerationPipeline?(event: GenerationPipelineTelemetry): void;
}

export const NOOP_GENERATION_TELEMETRY: GenerationTelemetrySink = {
  recordGenerationAttempt() {},
  recordGenerationPipeline() {},
};
