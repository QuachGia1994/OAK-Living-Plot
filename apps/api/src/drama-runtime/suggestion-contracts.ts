import type { DramaMood } from '../domain/drama';
import type { DramaLocale } from '../preferences/contracts';

export const DRAMA_SUGGESTION_DAILY_LIMIT = 12;
export const DRAMA_SUGGESTION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const DRAMA_SUGGESTION_PIPELINE_TIMEOUT_MS = 45 * 1000;
export const DRAMA_SUGGESTION_LEASE_MS = 60 * 1000;

export interface DramaSeedSuggestion {
  label: string;
  premise: string;
  mood: DramaMood;
  characterName: string;
}

export interface DramaSeedSuggestionRequest {
  requestKey: string;
  mood: DramaMood;
  characterName?: string;
  inspiration?: string;
}

export interface DramaSeedSuggestionProviderInput {
  locale: DramaLocale;
  mood: DramaMood;
  characterName?: string;
  inspiration?: string;
}

export interface DramaSeedSuggestionProviderMetrics {
  providerMs: number;
  parseMs: number;
  validateMs: number;
  providerCalls: number;
  repairs: number;
}

export interface DramaSeedSuggestionProviderSuccess extends DramaSeedSuggestionProviderMetrics {
  suggestions: [DramaSeedSuggestion, DramaSeedSuggestion, DramaSeedSuggestion];
}

export type DramaSeedSuggestionProviderError = {
  code: 'provider_unavailable' | 'invalid_suggestion_response';
  metrics: DramaSeedSuggestionProviderMetrics;
};

export interface DramaSeedSuggester {
  suggest(input: DramaSeedSuggestionProviderInput): Promise<
    { ok: true; value: DramaSeedSuggestionProviderSuccess } |
    { ok: false; error: DramaSeedSuggestionProviderError }
  >;
}

export type DramaSuggestionOutcome =
  | 'accepted'
  | 'replayed'
  | 'rate_limited'
  | 'invalid_response'
  | 'provider_error'
  | 'conflict';

export interface DramaSuggestionTelemetryEvent {
  providerMs: number;
  parseMs: number;
  validateMs: number;
  totalMs: number;
  providerCalls: number;
  repairs: number;
  outcome: DramaSuggestionOutcome;
}

export interface DramaSuggestionTelemetrySink {
  recordDramaSuggestion(event: DramaSuggestionTelemetryEvent): void;
}

export const NOOP_DRAMA_SUGGESTION_TELEMETRY: DramaSuggestionTelemetrySink = {
  recordDramaSuggestion() {},
};

export type DramaSuggestionErrorCode =
  | 'invalid_input'
  | 'suggestion_conflict'
  | 'suggestion_in_progress'
  | 'suggestion_rate_limited'
  | 'provider_unavailable'
  | 'invalid_suggestion_response'
  | 'persistence_error';

export interface DramaSuggestionError {
  code: DramaSuggestionErrorCode;
}

export type DramaSuggestionResult =
  | { ok: true; value: { suggestions: [DramaSeedSuggestion, DramaSeedSuggestion, DramaSeedSuggestion]; replayed: boolean } }
  | { ok: false; error: DramaSuggestionError };
