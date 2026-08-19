import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import migrationOne from '../migrations/0001_initial.sql?raw';
import migrationFour from '../migrations/0004_quota_ledger.sql?raw';
import migrationTen from '../migrations/0010_referrals_portraits.sql?raw';
import type { AppEnv } from '../src/env';
import { D1ReferralService } from '../src/referrals/d1-referral-service';
import { D1VoiceBonusLedger } from '../src/referrals/d1-voice-bonus-ledger';
import { REFERRAL_VOICE_BONUS_CREDITS } from '../src/referrals/contracts';
import { applySqlMigration, resetStoryData } from './d1-test-utils';

const db = (env as unknown as AppEnv).DB;
let now = Date.parse('2026-08-19T10:00:00.000Z');

beforeAll(async () => {
  await applySqlMigration(db, migrationOne);
  await applySqlMigration(db, migrationFour);
  await applySqlMigration(db, migrationTen);
});

beforeEach(async () => {
  await resetStoryData(db);
  await db.prepare('INSERT INTO users (id) VALUES (?), (?), (?)').bind('inviter', 'referred', 'other').run();
  now = Date.parse('2026-08-19T10:00:00.000Z');
});

describe('referrals', () => {
  it('creates a stable code, accepts one non-self claim, and grants fifty voice credits exactly once on Plus activation', async () => {
    const referrals = new D1ReferralService(db, () => now);
    const inviter = await referrals.snapshot('inviter');
    const repeated = await referrals.snapshot('inviter');
    expect(inviter.code).toBe(repeated.code);

    const claim = await referrals.claim('referred', inviter.code);
    expect(claim.ok).toBe(true);

    const activationAt = Date.parse('2026-08-19T10:05:00.000Z');
    const reward = await referrals.grantForPlusActivation('referred', 'rc-event-1', activationAt);
    const replay = await referrals.grantForPlusActivation('referred', 'rc-event-2', activationAt + 1_000);
    expect(reward).toEqual({
      ok: true,
      value: { rewarded: true, inviterUserId: 'inviter', creditsGranted: REFERRAL_VOICE_BONUS_CREDITS },
    });
    expect(replay).toEqual({ ok: true, value: { rewarded: false, inviterUserId: 'inviter', creditsGranted: 0 } });
    expect((await referrals.snapshot('inviter')).bonusVoiceCredits).toBe(50);
    expect((await referrals.snapshot('inviter')).successfulReferrals).toBe(1);
  });

  it('does not reward a referral claim created after the Plus activation event', async () => {
    const referrals = new D1ReferralService(db, () => now);
    const inviter = await referrals.snapshot('inviter');
    now = Date.parse('2026-08-19T10:10:00.000Z');
    expect((await referrals.claim('referred', inviter.code)).ok).toBe(true);

    const reward = await referrals.grantForPlusActivation('referred', 'old-plus-event', Date.parse('2026-08-19T10:05:00.000Z'));
    expect(reward).toEqual({ ok: true, value: { rewarded: false, inviterUserId: 'inviter', creditsGranted: 0 } });
    expect((await referrals.snapshot('inviter')).bonusVoiceCredits).toBe(0);
  });

  it('converges concurrent Plus reward events to one inviter grant', async () => {
    const referrals = new D1ReferralService(db, () => now);
    const inviter = await referrals.snapshot('inviter');
    expect((await referrals.claim('referred', inviter.code)).ok).toBe(true);
    const activatedAt = now + 60_000;

    const results = await Promise.all([
      referrals.grantForPlusActivation('referred', 'rc-concurrent-a', activatedAt),
      referrals.grantForPlusActivation('referred', 'rc-concurrent-b', activatedAt + 1),
    ]);

    expect(results.filter((result) => result.ok && result.value.rewarded)).toHaveLength(1);
    expect((await referrals.snapshot('inviter')).bonusVoiceCredits).toBe(50);
    const grants = await db.prepare('SELECT COUNT(*) AS count FROM voice_bonus_grants WHERE referred_user_id = ?').bind('referred').first<{ count: number }>();
    expect(grants?.count).toBe(1);
  });

  it('rejects self-referral and a second different claim', async () => {
    const referrals = new D1ReferralService(db, () => now);
    const inviter = await referrals.snapshot('inviter');
    const other = await referrals.snapshot('other');

    expect(await referrals.claim('inviter', inviter.code)).toMatchObject({ ok: false, error: { code: 'self_referral' } });
    expect((await referrals.claim('referred', inviter.code)).ok).toBe(true);
    expect(await referrals.claim('referred', other.code)).toMatchObject({ ok: false, error: { code: 'already_claimed' } });
  });
});

describe('voice bonus ledger', () => {
  it('keeps same-key concurrent release/reactivate/consume transitions single-counted', async () => {
    await db
      .prepare('INSERT INTO voice_bonus_accounts (user_id, available_credits, earned_credits) VALUES (?, 1, 1)')
      .bind('inviter')
      .run();
    const bonus = new D1VoiceBonusLedger(db, () => now);
    expect((await bonus.reserve('inviter', 'bonus-race-001')).ok).toBe(true);

    const releases = await Promise.all([
      bonus.release('inviter', 'bonus-race-001'),
      bonus.release('inviter', 'bonus-race-001'),
    ]);
    expect(releases.every((result) => result.ok)).toBe(true);
    expect(await bonus.balance('inviter')).toBe(1);

    const reactivated = await Promise.all([
      bonus.reserve('inviter', 'bonus-race-001'),
      bonus.reserve('inviter', 'bonus-race-001'),
    ]);
    expect(reactivated.every((result) => result.ok)).toBe(true);
    expect(await bonus.balance('inviter')).toBe(0);

    const consumed = await Promise.all([
      bonus.consume('inviter', 'bonus-race-001', 'audio-race'),
      bonus.consume('inviter', 'bonus-race-001', 'audio-race'),
    ]);
    expect(consumed.every((result) => result.ok)).toBe(true);
    const account = await db
      .prepare('SELECT available_credits, earned_credits, spent_credits FROM voice_bonus_accounts WHERE user_id = ?')
      .bind('inviter')
      .first<{ available_credits: number; earned_credits: number; spent_credits: number }>();
    expect(account).toEqual({ available_credits: 0, earned_credits: 1, spent_credits: 1 });
  });

  it('reserves, releases, reuses, and consumes referral voice credits without double spend', async () => {
    await db
      .prepare('INSERT INTO voice_bonus_accounts (user_id, available_credits, earned_credits) VALUES (?, 2, 2)')
      .bind('inviter')
      .run();
    const bonus = new D1VoiceBonusLedger(db, () => now);

    const first = await bonus.reserve('inviter', 'bonus-voice-001');
    expect(first.ok).toBe(true);
    expect(await bonus.balance('inviter')).toBe(1);
    expect((await bonus.reserve('inviter', 'bonus-voice-001')).ok).toBe(true);
    expect(await bonus.balance('inviter')).toBe(1);

    expect((await bonus.release('inviter', 'bonus-voice-001')).ok).toBe(true);
    expect(await bonus.balance('inviter')).toBe(2);

    expect((await bonus.reserve('inviter', 'bonus-voice-001')).ok).toBe(true);
    expect(await bonus.balance('inviter')).toBe(1);
    expect((await bonus.consume('inviter', 'bonus-voice-001', 'audio-1')).ok).toBe(true);
    expect((await bonus.consume('inviter', 'bonus-voice-001', 'audio-1')).ok).toBe(true);
    expect(await bonus.balance('inviter')).toBe(1);

    const account = await db
      .prepare('SELECT available_credits, earned_credits, spent_credits FROM voice_bonus_accounts WHERE user_id = ?')
      .bind('inviter')
      .first<{ available_credits: number; earned_credits: number; spent_credits: number }>();
    expect(account).toEqual({ available_credits: 1, earned_credits: 2, spent_credits: 1 });
  });
});
