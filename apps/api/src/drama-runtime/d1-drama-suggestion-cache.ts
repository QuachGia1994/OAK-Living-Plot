import type { DramaSeedSuggestion } from './suggestion-contracts';
import { validatePublicSuggestions } from './suggestion-validation';

interface CacheRow {
  input_fingerprint: string;
  status: 'pending' | 'ready';
  lease_token: string | null;
  lease_expires_at: number | null;
  suggestions_json: string | null;
}

export type SuggestionReservation =
  | { kind: 'acquired'; leaseToken: string }
  | { kind: 'replay'; suggestions: [DramaSeedSuggestion, DramaSeedSuggestion, DramaSeedSuggestion] }
  | { kind: 'conflict' }
  | { kind: 'in_progress' };

export class D1DramaSuggestionCache {
  constructor(private readonly db: D1Database) {}

  async reserve(
    userId: string,
    requestKey: string,
    inputFingerprint: string,
    nowMs: number,
    leaseMs: number,
  ): Promise<SuggestionReservation> {
    const existing = await this.load(userId, requestKey);
    if (existing) return this.resolveExisting(userId, requestKey, inputFingerprint, existing, nowMs, leaseMs);

    const leaseToken = crypto.randomUUID();
    try {
      await this.db
        .prepare(
          `INSERT INTO drama_suggestion_cache
             (user_id, request_key, input_fingerprint, status, lease_token, lease_expires_at, created_at, updated_at)
           VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)`,
        )
        .bind(userId, requestKey, inputFingerprint, leaseToken, nowMs + leaseMs, nowMs, nowMs)
        .run();
      return { kind: 'acquired', leaseToken };
    } catch {
      const raced = await this.load(userId, requestKey);
      if (!raced) throw new Error('Suggestion reservation could not be resolved.');
      return this.resolveExisting(userId, requestKey, inputFingerprint, raced, nowMs, leaseMs);
    }
  }

  async release(userId: string, requestKey: string, leaseToken: string): Promise<void> {
    await this.db
      .prepare(
        `DELETE FROM drama_suggestion_cache
         WHERE user_id = ? AND request_key = ? AND status = 'pending' AND lease_token = ?`,
      )
      .bind(userId, requestKey, leaseToken)
      .run();
  }

  async finalize(
    userId: string,
    requestKey: string,
    leaseToken: string,
    suggestions: [DramaSeedSuggestion, DramaSeedSuggestion, DramaSeedSuggestion],
    nowMs: number,
    utcDayStartMs: number,
    utcDayEndMs: number,
    dailyLimit: number,
  ): Promise<'ready' | 'rate_limited' | 'lost_lease'> {
    const result = await this.db
      .prepare(
        `UPDATE drama_suggestion_cache
         SET status = 'ready', lease_token = NULL, lease_expires_at = NULL,
             suggestions_json = ?, ready_at = ?, updated_at = ?
         WHERE user_id = ? AND request_key = ? AND status = 'pending' AND lease_token = ?
           AND (
             SELECT COUNT(*) FROM drama_suggestion_cache
             WHERE user_id = ? AND status = 'ready' AND ready_at >= ? AND ready_at < ?
           ) < ?`,
      )
      .bind(
        JSON.stringify(suggestions), nowMs, nowMs,
        userId, requestKey, leaseToken,
        userId, utcDayStartMs, utcDayEndMs, dailyLimit,
      )
      .run();
    if ((result.meta.changes ?? 0) > 0) return 'ready';

    const row = await this.load(userId, requestKey);
    if (!row || row.status !== 'pending' || row.lease_token !== leaseToken) return 'lost_lease';
    const successful = await this.countReady(userId, utcDayStartMs, utcDayEndMs);
    return successful >= dailyLimit ? 'rate_limited' : 'lost_lease';
  }

  async countReady(userId: string, utcDayStartMs: number, utcDayEndMs: number): Promise<number> {
    const row = await this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM drama_suggestion_cache
         WHERE user_id = ? AND status = 'ready' AND ready_at >= ? AND ready_at < ?`,
      )
      .bind(userId, utcDayStartMs, utcDayEndMs)
      .first<{ count: number }>();
    return row?.count ?? 0;
  }

  async cleanupOlderThan(cutoffMs: number): Promise<void> {
    await this.db.prepare('DELETE FROM drama_suggestion_cache WHERE updated_at < ?').bind(cutoffMs).run();
  }

  private async resolveExisting(
    userId: string,
    requestKey: string,
    inputFingerprint: string,
    row: CacheRow,
    nowMs: number,
    leaseMs: number,
  ): Promise<SuggestionReservation> {
    if (row.input_fingerprint !== inputFingerprint) return { kind: 'conflict' };
    if (row.status === 'ready') {
      const suggestions = parseCachedSuggestions(row.suggestions_json);
      if (!suggestions) throw new Error('Ready suggestion cache row is invalid.');
      return { kind: 'replay', suggestions };
    }
    if (row.lease_expires_at !== null && row.lease_expires_at > nowMs) return { kind: 'in_progress' };

    const leaseToken = crypto.randomUUID();
    const result = await this.db
      .prepare(
        `UPDATE drama_suggestion_cache
         SET lease_token = ?, lease_expires_at = ?, updated_at = ?
         WHERE user_id = ? AND request_key = ? AND input_fingerprint = ? AND status = 'pending'
           AND lease_expires_at <= ?`,
      )
      .bind(leaseToken, nowMs + leaseMs, nowMs, userId, requestKey, inputFingerprint, nowMs)
      .run();
    return (result.meta.changes ?? 0) > 0 ? { kind: 'acquired', leaseToken } : { kind: 'in_progress' };
  }

  private async load(userId: string, requestKey: string): Promise<CacheRow | null> {
    return this.db
      .prepare(
        `SELECT input_fingerprint, status, lease_token, lease_expires_at, suggestions_json
         FROM drama_suggestion_cache WHERE user_id = ? AND request_key = ?`,
      )
      .bind(userId, requestKey)
      .first<CacheRow>();
  }
}

function parseCachedSuggestions(raw: string | null): [DramaSeedSuggestion, DramaSeedSuggestion, DramaSeedSuggestion] | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length !== 3) return null;
    const suggestions = value.filter(isSuggestion);
    if (suggestions.length !== 3 || validatePublicSuggestions(suggestions).length > 0) return null;
    return suggestions as [DramaSeedSuggestion, DramaSeedSuggestion, DramaSeedSuggestion];
  } catch {
    return null;
  }
}

function isSuggestion(value: unknown): value is DramaSeedSuggestion {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  return keys.length === 4
    && keys.every((key) => key === 'label' || key === 'premise' || key === 'mood' || key === 'characterName')
    && typeof record.label === 'string'
    && typeof record.premise === 'string'
    && typeof record.characterName === 'string'
    && (record.mood === 'tense' || record.mood === 'mysterious' || record.mood === 'romantic' || record.mood === 'hopeful');
}
