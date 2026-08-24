import { D1UserPreferencesRepository } from '../preferences/d1-user-preferences';
import { D1DramaSuggestionCache } from './d1-drama-suggestion-cache';
import {
  DRAMA_SUGGESTION_CACHE_TTL_MS,
  DRAMA_SUGGESTION_DAILY_LIMIT,
  DRAMA_SUGGESTION_LEASE_MS,
  NOOP_DRAMA_SUGGESTION_TELEMETRY,
  type DramaSeedSuggester,
  type DramaSeedSuggestionProviderMetrics,
  type DramaSeedSuggestionRequest,
  type DramaSuggestionOutcome,
  type DramaSuggestionResult,
  type DramaSuggestionTelemetrySink,
} from './suggestion-contracts';
import { normalizeSuggestionRequest, validatePublicSuggestions } from './suggestion-validation';

type Clock = () => number;

export class DramaSuggestionService {
  private readonly cache: D1DramaSuggestionCache;
  private readonly preferences: D1UserPreferencesRepository;

  constructor(
    db: D1Database,
    private readonly suggester: DramaSeedSuggester,
    private readonly clock: Clock = Date.now,
    private readonly telemetry: DramaSuggestionTelemetrySink = NOOP_DRAMA_SUGGESTION_TELEMETRY,
  ) {
    this.cache = new D1DramaSuggestionCache(db);
    this.preferences = new D1UserPreferencesRepository(db);
  }

  async suggest(userId: string, input: DramaSeedSuggestionRequest): Promise<DramaSuggestionResult> {
    const startedAt = this.clock();
    const normalized = normalizeSuggestionRequest(input);
    if (!userId.trim() || !normalized) return { ok: false, error: { code: 'invalid_input' } };

    try {
      const preferences = await this.preferences.get(userId);
      const fingerprint = await inputFingerprint({
        locale: preferences.dramaLocale,
        mood: normalized.mood,
        characterName: normalized.characterName ?? null,
        inspiration: normalized.inspiration ?? null,
      });
      const nowMs = this.clock();
      const day = utcDayWindow(nowMs);
      await this.cleanup(nowMs);
      const reservation = await this.cache.reserve(userId, normalized.requestKey, fingerprint, nowMs, DRAMA_SUGGESTION_LEASE_MS);
      if (reservation.kind === 'replay') {
        this.record('replayed', startedAt, emptyMetrics());
        return { ok: true, value: { suggestions: reservation.suggestions, replayed: true } };
      }
      if (reservation.kind === 'conflict') {
        this.record('conflict', startedAt, emptyMetrics());
        return { ok: false, error: { code: 'suggestion_conflict' } };
      }
      if (reservation.kind === 'in_progress') return { ok: false, error: { code: 'suggestion_in_progress' } };

      if (await this.cache.countReady(userId, day.start, day.end) >= DRAMA_SUGGESTION_DAILY_LIMIT) {
        await this.safeRelease(userId, normalized.requestKey, reservation.leaseToken);
        this.record('rate_limited', startedAt, emptyMetrics());
        return { ok: false, error: { code: 'suggestion_rate_limited' } };
      }

      const generated = await this.suggester.suggest({
        locale: preferences.dramaLocale,
        mood: normalized.mood,
        ...(normalized.characterName ? { characterName: normalized.characterName } : {}),
        ...(normalized.inspiration ? { inspiration: normalized.inspiration } : {}),
      });
      if (!generated.ok) {
        await this.safeRelease(userId, normalized.requestKey, reservation.leaseToken);
        const outcome: DramaSuggestionOutcome = generated.error.code === 'provider_unavailable' ? 'provider_error' : 'invalid_response';
        this.record(outcome, startedAt, generated.error.metrics);
        return { ok: false, error: { code: generated.error.code } };
      }

      if (validatePublicSuggestions(generated.value.suggestions).length > 0) {
        await this.safeRelease(userId, normalized.requestKey, reservation.leaseToken);
        this.record('invalid_response', startedAt, generated.value);
        return { ok: false, error: { code: 'invalid_suggestion_response' } };
      }

      const finalizedAt = this.clock();
      const finalDay = utcDayWindow(finalizedAt);
      const finalized = await this.cache.finalize(
        userId,
        normalized.requestKey,
        reservation.leaseToken,
        generated.value.suggestions,
        finalizedAt,
        finalDay.start,
        finalDay.end,
        DRAMA_SUGGESTION_DAILY_LIMIT,
      );
      if (finalized === 'ready') {
        this.record('accepted', startedAt, generated.value);
        return { ok: true, value: { suggestions: generated.value.suggestions, replayed: false } };
      }
      if (finalized === 'rate_limited') {
        await this.safeRelease(userId, normalized.requestKey, reservation.leaseToken);
        this.record('rate_limited', startedAt, generated.value);
        return { ok: false, error: { code: 'suggestion_rate_limited' } };
      }

      const resolved = await this.cache.reserve(userId, normalized.requestKey, fingerprint, this.clock(), DRAMA_SUGGESTION_LEASE_MS);
      if (resolved.kind === 'replay') {
        this.record('replayed', startedAt, generated.value);
        return { ok: true, value: { suggestions: resolved.suggestions, replayed: true } };
      }
      if (resolved.kind === 'conflict') {
        this.record('conflict', startedAt, generated.value);
        return { ok: false, error: { code: 'suggestion_conflict' } };
      }
      return { ok: false, error: { code: 'suggestion_in_progress' } };
    } catch {
      return { ok: false, error: { code: 'persistence_error' } };
    }
  }

  private async cleanup(nowMs: number): Promise<void> {
    try {
      await this.cache.cleanupOlderThan(nowMs - DRAMA_SUGGESTION_CACHE_TTL_MS);
    } catch {
      // Derived cache cleanup is opportunistic and never changes request semantics.
    }
  }

  private async safeRelease(userId: string, requestKey: string, leaseToken: string): Promise<void> {
    try {
      await this.cache.release(userId, requestKey, leaseToken);
    } catch {
      // A stale pending lease expires and is recoverable even if explicit release fails.
    }
  }

  private record(outcome: DramaSuggestionOutcome, startedAt: number, metrics: DramaSeedSuggestionProviderMetrics): void {
    try {
      this.telemetry.recordDramaSuggestion({
        providerMs: metrics.providerMs,
        parseMs: metrics.parseMs,
        validateMs: metrics.validateMs,
        totalMs: Math.max(0, this.clock() - startedAt),
        providerCalls: metrics.providerCalls,
        repairs: metrics.repairs,
        outcome,
      });
    } catch {
      // Suggestion telemetry is observational and must never change response behavior.
    }
  }
}

async function inputFingerprint(input: object): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(input)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function utcDayWindow(nowMs: number): { start: number; end: number } {
  const now = new Date(nowMs);
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return { start, end: start + 24 * 60 * 60 * 1000 };
}

function emptyMetrics(): DramaSeedSuggestionProviderMetrics {
  return { providerMs: 0, parseMs: 0, validateMs: 0, providerCalls: 0, repairs: 0 };
}
