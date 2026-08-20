import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import migrationOne from '../migrations/0001_initial.sql?raw';
import migrationTwo from '../migrations/0002_episode_publication.sql?raw';
import migrationThree from '../migrations/0003_choice_commit.sql?raw';
import migrationFour from '../migrations/0004_quota_ledger.sql?raw';
import migrationNine from '../migrations/0009_retryable_quota_reservations.sql?raw';
import type { AppEnv } from '../src/env';
import { D1QuotaLedger } from '../src/quota/d1-quota-ledger';
import { quotaModeFromEnv, quotaPolicyFor, quotaResourceIsEnforced } from '../src/quota/policy';
import { applySqlMigration, resetStoryData } from './d1-test-utils';

const db = (env as unknown as AppEnv).DB;
let nowMs = Date.parse('2026-08-16T12:00:00.000Z');

beforeAll(async () => {
  await applySqlMigration(db, migrationOne);
  await applySqlMigration(db, migrationTwo);
  await applySqlMigration(db, migrationThree);
  await applySqlMigration(db, migrationFour);
  await applySqlMigration(db, migrationNine);
});

beforeEach(async () => {
  await resetStoryData(db);
  await db.prepare('INSERT INTO users (id) VALUES (?)').bind('user-1').run();
  nowMs = Date.parse('2026-08-16T12:00:00.000Z');
});

describe('quota policy', () => {
  it('keeps legacy text display thresholds and current voice limits stable', () => {
    expect(quotaPolicyFor('free')).toEqual({ legacyTextDisplayLimit: 50, voiceEpisodesPerUtcDay: 1 });
    expect(quotaPolicyFor('plus')).toEqual({ legacyTextDisplayLimit: 100, voiceEpisodesPerUtcDay: 10 });
  });

  it('never enforces text Scene quota while preserving environment-owned voice enforcement', () => {
    expect(quotaResourceIsEnforced('enforced', 'text_episode')).toBe(false);
    expect(quotaResourceIsEnforced('preview_unlimited', 'text_episode')).toBe(false);
    expect(quotaResourceIsEnforced('enforced', 'voice_episode')).toBe(true);
    expect(quotaResourceIsEnforced('preview_unlimited', 'voice_episode')).toBe(false);
  });

  it('fails closed to enforced quota unless the server explicitly selects preview unlimited', () => {
    expect(quotaModeFromEnv(undefined)).toBe('enforced');
    expect(quotaModeFromEnv('store')).toBe('enforced');
    expect(quotaModeFromEnv('preview_unlimited')).toBe('preview_unlimited');
  });
});

describe('D1QuotaLedger', () => {
  it('keeps concurrent Free text reservations unlimited beyond the former fifty-scene threshold', async () => {
    await db.prepare(`INSERT INTO daily_usage (user_id, usage_date, text_episodes, text_reserved) VALUES ('user-1', '2026-08-16', 49, 0)`).run();
    const ledger = quotaLedger();
    const results = await Promise.all([
      ledger.reserve({ userId: 'user-1', reservationKey: 'free-boundary-left', resourceType: 'text_episode', tier: 'free' }),
      ledger.reserve({ userId: 'user-1', reservationKey: 'free-boundary-right', resourceType: 'text_episode', tier: 'free' }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(2);
    expect(await ledger.getDailyUsage('user-1', '2026-08-16')).toMatchObject({ textReserved: 2, textConsumed: 49 });
  });

  it('keeps concurrent Plus text reservations unlimited beyond the former hundred-scene threshold', async () => {
    await db.prepare(`INSERT INTO daily_usage (user_id, usage_date, text_episodes, text_reserved) VALUES ('user-1', '2026-08-16', 99, 0)`).run();
    const ledger = quotaLedger();
    const results = await Promise.all([
      ledger.reserve({ userId: 'user-1', reservationKey: 'plus-boundary-left', resourceType: 'text_episode', tier: 'plus' }),
      ledger.reserve({ userId: 'user-1', reservationKey: 'plus-boundary-right', resourceType: 'text_episode', tier: 'plus' }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(2);
    expect(await ledger.getDailyUsage('user-1', '2026-08-16')).toMatchObject({ textReserved: 2, textConsumed: 99 });
  });

  it('keeps text Scene generation unlimited while enforced mode still caps fresh voice', async () => {
    await db.prepare(`INSERT INTO daily_usage (user_id, usage_date, text_episodes, voiced_episodes, text_reserved, voice_reserved) VALUES ('user-1', '2026-08-16', 50, 1, 0, 0)`).run();
    const ledger = quotaLedger();

    const text = await ledger.reserve({ userId: 'user-1', reservationKey: 'unlimited-text-over-limit', resourceType: 'text_episode', tier: 'free' });
    const voice = await ledger.reserve({ userId: 'user-1', reservationKey: 'enforced-voice-over-limit', resourceType: 'voice_episode', tier: 'free' });

    expect(text.ok).toBe(true);
    expect(voice).toMatchObject({ ok: false, error: { code: 'quota_exceeded', resourceType: 'voice_episode', limit: 1 } });
    expect(await ledger.getDailyUsage('user-1', '2026-08-16')).toMatchObject({ textConsumed: 50, voiceConsumed: 1, textReserved: 1, voiceReserved: 0 });
  });

  it('keeps preview work ledgered but does not block after the production daily limit', async () => {
    await db.prepare(`INSERT INTO daily_usage (user_id, usage_date, text_episodes, voiced_episodes, text_reserved, voice_reserved) VALUES ('user-1', '2026-08-16', 50, 1, 0, 0)`).run();
    const ledger = new D1QuotaLedger(db, () => nowMs, 'preview_unlimited');

    const text = await ledger.reserve({ userId: 'user-1', reservationKey: 'preview-text-over-limit', resourceType: 'text_episode', tier: 'free' });
    const voice = await ledger.reserve({ userId: 'user-1', reservationKey: 'preview-voice-over-limit', resourceType: 'voice_episode', tier: 'free' });

    expect(text.ok).toBe(true);
    expect(voice.ok).toBe(true);
    expect(await ledger.getDailyUsage('user-1', '2026-08-16')).toMatchObject({ textConsumed: 50, voiceConsumed: 1, textReserved: 1, voiceReserved: 1 });
  });

  it('allows voice consumption independently of same-day text consumption', async () => {
    const ledger = quotaLedger();
    const reserved = await ledger.reserve({
      userId: 'user-1',
      reservationKey: 'voice-only-001',
      resourceType: 'voice_episode',
      tier: 'free',
    });
    expect(reserved.ok).toBe(true);

    const consumed = await ledger.consume({ userId: 'user-1', reservationKey: 'voice-only-001', resourceId: 'audio-1' });

    expect(consumed.ok).toBe(true);
    if (!consumed.ok) return;
    expect(consumed.value.daily).toMatchObject({ textConsumed: 0, voiceConsumed: 1, voiceReserved: 0 });
    const second = await ledger.reserve({
      userId: 'user-1',
      reservationKey: 'voice-only-002',
      resourceType: 'voice_episode',
      tier: 'free',
    });
    expect(second).toMatchObject({ ok: false, error: { code: 'quota_exceeded', limit: 1 } });
  });

  it('releases a failed provider reservation and restores the quota slot', async () => {
    const ledger = quotaLedger();
    const first = await ledger.reserve({ userId: 'user-1', reservationKey: 'release-001', resourceType: 'voice_episode', tier: 'free' });
    expect(first.ok).toBe(true);

    const released = await ledger.release({ userId: 'user-1', reservationKey: 'release-001' });
    const retryRelease = await ledger.release({ userId: 'user-1', reservationKey: 'release-001' });
    const replacement = await ledger.reserve({ userId: 'user-1', reservationKey: 'release-002', resourceType: 'voice_episode', tier: 'free' });

    expect(released.ok).toBe(true);
    expect(retryRelease.ok).toBe(true);
    if (retryRelease.ok) expect(retryRelease.value.replayed).toBe(true);
    expect(replacement.ok).toBe(true);
    const reconciliation = await ledger.reconcileDay('user-1', '2026-08-16');
    expect(reconciliation.reconciled).toBe(true);
    expect(reconciliation.daily).toMatchObject({ voiceConsumed: 0, voiceReserved: 1 });
  });

  it('re-arms released logical work with the same key on the current UTC day', async () => {
    const ledger = quotaLedger();
    await ledger.reserve({ userId: 'user-1', reservationKey: 'retry-same-key-001', resourceType: 'text_episode', tier: 'free' });
    await ledger.release({ userId: 'user-1', reservationKey: 'retry-same-key-001' });

    nowMs = Date.parse('2026-08-17T00:00:00.100Z');
    const retried = await ledger.reserve({ userId: 'user-1', reservationKey: 'retry-same-key-001', resourceType: 'text_episode', tier: 'free' });

    expect(retried.ok).toBe(true);
    if (!retried.ok) return;
    expect(retried.value).toMatchObject({ status: 'reserved', utcDay: '2026-08-17', resourceId: null });
    expect(await ledger.getDailyUsage('user-1', '2026-08-16')).toMatchObject({ textConsumed: 0, textReserved: 0 });
    expect(await ledger.getDailyUsage('user-1', '2026-08-17')).toMatchObject({ textConsumed: 0, textReserved: 1 });
    expect(await countEvents('retry-same-key-001', 'reserved')).toBe(2);
    expect(await countEvents('retry-same-key-001', 'released')).toBe(1);
    expect((await ledger.reconcileDay('user-1', '2026-08-16')).reconciled).toBe(true);
    expect((await ledger.reconcileDay('user-1', '2026-08-17')).reconciled).toBe(true);
  });

  it('consumes an idempotent reservation exactly once', async () => {
    const ledger = quotaLedger();
    await ledger.reserve({ userId: 'user-1', reservationKey: 'consume-001', resourceType: 'text_episode', tier: 'free' });

    const first = await ledger.consume({ userId: 'user-1', reservationKey: 'consume-001', resourceId: 'episode-1' });
    const second = await ledger.consume({ userId: 'user-1', reservationKey: 'consume-001', resourceId: 'episode-1' });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.replayed).toBe(true);
    expect(second.value.daily).toMatchObject({ textConsumed: 1, textReserved: 0 });
    expect((await countEvents('consume-001', 'consumed'))).toBe(1);
    expect((await ledger.reconcileDay('user-1', '2026-08-16')).reconciled).toBe(true);
  });

  it('keeps a reservation on its original UTC day across midnight', async () => {
    nowMs = Date.parse('2026-08-16T23:59:59.900Z');
    const ledger = quotaLedger();
    const reserved = await ledger.reserve({ userId: 'user-1', reservationKey: 'rollover-001', resourceType: 'text_episode', tier: 'free' });
    expect(reserved.ok).toBe(true);

    nowMs = Date.parse('2026-08-17T00:00:00.100Z');
    const consumed = await ledger.consume({ userId: 'user-1', reservationKey: 'rollover-001', resourceId: 'episode-old-day' });
    const nextDay = await ledger.reserve({ userId: 'user-1', reservationKey: 'rollover-002', resourceType: 'text_episode', tier: 'free' });

    expect(consumed.ok).toBe(true);
    expect(nextDay.ok).toBe(true);
    expect(await ledger.getDailyUsage('user-1', '2026-08-16')).toMatchObject({ textConsumed: 1, textReserved: 0 });
    expect(await ledger.getDailyUsage('user-1', '2026-08-17')).toMatchObject({ textConsumed: 0, textReserved: 1 });
    expect((await ledger.reconcileDay('user-1', '2026-08-16')).reconciled).toBe(true);
    expect((await ledger.reconcileDay('user-1', '2026-08-17')).reconciled).toBe(true);
  });

  it('rejects reservation-key reuse for another resource type', async () => {
    const ledger = quotaLedger();
    await ledger.reserve({ userId: 'user-1', reservationKey: 'key-conflict-001', resourceType: 'text_episode', tier: 'free' });

    const conflict = await ledger.reserve({ userId: 'user-1', reservationKey: 'key-conflict-001', resourceType: 'voice_episode', tier: 'free' });

    expect(conflict).toEqual({
      ok: false,
      error: { code: 'key_conflict', message: 'Reservation key belongs to different logical work.' },
    });
  });

  it('allows exactly one terminal result in a concurrent consume/release race', async () => {
    const ledger = quotaLedger();
    await ledger.reserve({ userId: 'user-1', reservationKey: 'terminal-race-001', resourceType: 'text_episode', tier: 'free' });

    const results = await Promise.all([
      ledger.consume({ userId: 'user-1', reservationKey: 'terminal-race-001', resourceId: 'episode-race' }),
      ledger.release({ userId: 'user-1', reservationKey: 'terminal-race-001' }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok && result.error.code === 'invalid_transition')).toHaveLength(1);
    expect((await ledger.reconcileDay('user-1', '2026-08-16')).reconciled).toBe(true);
  });

  it('reconciles mixed reserve, consume, and release ledger paths', async () => {
    const ledger = quotaLedger();
    await ledger.reserve({ userId: 'user-1', reservationKey: 'mixed-text-001', resourceType: 'text_episode', tier: 'free' });
    await ledger.consume({ userId: 'user-1', reservationKey: 'mixed-text-001', resourceId: 'episode-1' });
    await ledger.reserve({ userId: 'user-1', reservationKey: 'mixed-text-002', resourceType: 'text_episode', tier: 'free' });
    await ledger.release({ userId: 'user-1', reservationKey: 'mixed-text-002' });
    await ledger.reserve({ userId: 'user-1', reservationKey: 'mixed-voice-001', resourceType: 'voice_episode', tier: 'free' });
    await ledger.consume({ userId: 'user-1', reservationKey: 'mixed-voice-001', resourceId: 'audio-1' });

    const reconciliation = await ledger.reconcileDay('user-1', '2026-08-16');
    expect(reconciliation.reconciled).toBe(true);
    expect(reconciliation.daily).toMatchObject({
      textConsumed: 1,
      voiceConsumed: 1,
      textReserved: 0,
      voiceReserved: 0,
    });
    expect(reconciliation.ledger).toEqual({ textConsumed: 1, voiceConsumed: 1, textReserved: 0, voiceReserved: 0 });
  });

  it('does not create quota state for an unknown user', async () => {
    const ledger = quotaLedger();
    const result = await ledger.reserve({ userId: 'missing-user', reservationKey: 'missing-001', resourceType: 'text_episode', tier: 'free' });

    expect(result).toEqual({ ok: false, error: { code: 'not_found', message: 'User not found.' } });
    expect(await countRows('quota_reservations')).toBe(0);
    expect(await countRows('usage_events')).toBe(0);
  });
});

function quotaLedger(): D1QuotaLedger {
  return new D1QuotaLedger(db, () => nowMs);
}

async function countEvents(reservationKey: string, eventType: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS count FROM usage_events WHERE reservation_key = ? AND event_type = ?')
    .bind(reservationKey, eventType)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

async function countRows(table: 'quota_reservations' | 'usage_events'): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>();
  return row?.count ?? 0;
}
