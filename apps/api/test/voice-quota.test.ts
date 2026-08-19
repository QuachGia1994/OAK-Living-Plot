import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import migrationOne from '../migrations/0001_initial.sql?raw';
import migrationFour from '../migrations/0004_quota_ledger.sql?raw';
import migrationTen from '../migrations/0010_referrals_portraits.sql?raw';
import type { AppEnv } from '../src/env';
import { D1QuotaLedger } from '../src/quota/d1-quota-ledger';
import { D1VoiceQuota } from '../src/quota/voice-quota';
import { applySqlMigration, resetStoryData } from './d1-test-utils';

const db = (env as unknown as AppEnv).DB;

beforeAll(async () => {
  await applySqlMigration(db, migrationOne);
  await applySqlMigration(db, migrationFour);
  await applySqlMigration(db, migrationTen);
});

beforeEach(async () => {
  await resetStoryData(db);
  await db.prepare(`INSERT INTO users (id) VALUES ('user-1')`).run();
});

describe('D1VoiceQuota', () => {
  it('uses persistent referral credits only after the daily voice allowance is exhausted', async () => {
    await db.prepare(`INSERT INTO daily_usage (user_id, usage_date, text_episodes, voiced_episodes) VALUES ('user-1', '2026-08-19', 1, 1)`).run();
    await db.prepare(`INSERT INTO voice_bonus_accounts (user_id, available_credits, earned_credits) VALUES ('user-1', 2, 2)`).run();
    const quota = new D1VoiceQuota(db);

    const reserved = await quota.reserve({ userId: 'user-1', reservationKey: 'bonus-fallback-001', tier: 'free' });
    expect(reserved).toMatchObject({ ok: true, value: { source: 'referral_bonus', status: 'reserved' } });
    expect(await quota.status('user-1', 'bonus-fallback-001')).toBe('reserved');

    const released = await quota.release({ userId: 'user-1', reservationKey: 'bonus-fallback-001' });
    expect(released).toMatchObject({ ok: true, value: { source: 'referral_bonus', status: 'released' } });
    expect(await quota.reserve({ userId: 'user-1', reservationKey: 'bonus-fallback-001', tier: 'free' })).toMatchObject({ ok: true, value: { source: 'referral_bonus' } });
    expect(await quota.consume({ userId: 'user-1', reservationKey: 'bonus-fallback-001', resourceId: 'audio-1' })).toMatchObject({ ok: true, value: { source: 'referral_bonus', status: 'consumed' } });

    const account = await db.prepare('SELECT available_credits, spent_credits FROM voice_bonus_accounts WHERE user_id = ?').bind('user-1').first<{ available_credits: number; spent_credits: number }>();
    expect(account).toEqual({ available_credits: 1, spent_credits: 1 });
  });

  it('keeps bonus ownership when a released daily row exists for the same logical key', async () => {
    const now = Date.parse('2026-08-19T10:00:00.000Z');
    const daily = new D1QuotaLedger(db, () => now);
    await daily.reserve({ userId: 'user-1', reservationKey: 'switch-source-001', resourceType: 'voice_episode', tier: 'free' });
    await daily.release({ userId: 'user-1', reservationKey: 'switch-source-001' });
    await daily.reserve({ userId: 'user-1', reservationKey: 'daily-consumed-001', resourceType: 'voice_episode', tier: 'free' });
    await daily.consume({ userId: 'user-1', reservationKey: 'daily-consumed-001', resourceId: 'daily-audio-1' });
    await db.prepare(`INSERT INTO voice_bonus_accounts (user_id, available_credits, earned_credits) VALUES ('user-1', 1, 1)`).run();
    const quota = new D1VoiceQuota(db, () => now);

    const reserved = await quota.reserve({ userId: 'user-1', reservationKey: 'switch-source-001', tier: 'free' });
    expect(reserved).toMatchObject({ ok: true, value: { source: 'referral_bonus', status: 'reserved' } });
    expect(await quota.status('user-1', 'switch-source-001')).toBe('reserved');
    const consumed = await quota.consume({ userId: 'user-1', reservationKey: 'switch-source-001', resourceId: 'bonus-audio-1' });
    expect(consumed).toMatchObject({ ok: true, value: { source: 'referral_bonus', status: 'consumed' } });
    expect(await db.prepare('SELECT available_credits, spent_credits FROM voice_bonus_accounts WHERE user_id = ?').bind('user-1').first()).toEqual({ available_credits: 0, spent_credits: 1 });
  });

  it('does not double-spend one referral credit under concurrent reservation pressure', async () => {
    await db.prepare(`INSERT INTO daily_usage (user_id, usage_date, text_episodes, voiced_episodes) VALUES ('user-1', '2026-08-19', 1, 1)`).run();
    await db.prepare(`INSERT INTO voice_bonus_accounts (user_id, available_credits, earned_credits) VALUES ('user-1', 1, 1)`).run();
    const quota = new D1VoiceQuota(db, () => Date.parse('2026-08-19T10:00:00.000Z'));

    const [left, right] = await Promise.all([
      quota.reserve({ userId: 'user-1', reservationKey: 'bonus-race-left', tier: 'free' }),
      quota.reserve({ userId: 'user-1', reservationKey: 'bonus-race-right', tier: 'free' }),
    ]);
    expect([left, right].filter((result) => result.ok)).toHaveLength(1);
    expect([left, right].filter((result) => !result.ok && result.error.code === 'quota_exceeded')).toHaveLength(1);
    expect(await db.prepare('SELECT available_credits FROM voice_bonus_accounts WHERE user_id = ?').bind('user-1').first<{ available_credits: number }>()).toEqual({ available_credits: 0 });
  });

  it('preserves the normal daily voice reservation when daily capacity remains', async () => {
    await db.prepare(`INSERT INTO voice_bonus_accounts (user_id, available_credits, earned_credits) VALUES ('user-1', 2, 2)`).run();
    const quota = new D1VoiceQuota(db);
    const reserved = await quota.reserve({ userId: 'user-1', reservationKey: 'daily-first-001', tier: 'free' });
    expect(reserved).toMatchObject({ ok: true, value: { source: 'daily' } });
    const account = await db.prepare('SELECT available_credits FROM voice_bonus_accounts WHERE user_id = ?').bind('user-1').first<{ available_credits: number }>();
    expect(account?.available_credits).toBe(2);
  });
});
