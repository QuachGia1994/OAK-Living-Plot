import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import migrationOne from '../migrations/0001_initial.sql?raw';
import migrationSix from '../migrations/0006_revenuecat_entitlements.sql?raw';
import migrationTen from '../migrations/0010_referrals_portraits.sql?raw';
import type { SessionVerifier } from '../src/auth/session-verifier';
import type { AppEnv } from '../src/env';
import { handleRequest } from '../src/http/app';
import { D1UserRepository } from '../src/persistence/d1-user-repository';
import { applySqlMigration, resetStoryData } from './d1-test-utils';

const runtimeEnv = env as unknown as AppEnv;
const db = runtimeEnv.DB;
const testEnv: AppEnv = {
  ...runtimeEnv,
  CLERK_JWT_KEY: 'unused',
  CLERK_AUTHORIZED_PARTIES: 'https://living-plot.test',
  GEMINI_API_KEY: 'unused',
  REVENUECAT_SECRET_API_KEY: 'unused',
  REVENUECAT_PLUS_ENTITLEMENT_ID: 'plus',
  REVENUECAT_WEBHOOK_AUTHORIZATION: 'Bearer unused',
  REVENUECAT_WEBHOOK_SIGNING_SECRET: 'unused',
};

beforeAll(async () => {
  await applySqlMigration(db, migrationOne);
  await applySqlMigration(db, migrationSix);
  await applySqlMigration(db, migrationTen);
});

beforeEach(async () => {
  await resetStoryData(db);
});

describe('referral HTTP boundary', () => {
  it('returns a stable owner code and lets another authenticated account claim it once', async () => {
    const inviter = await new D1UserRepository(db).resolveOrCreate('inviter-subject');
    await new D1UserRepository(db).resolveOrCreate('referred-subject');

    const mine = await call('/v1/referrals/me', 'GET', undefined, 'inviter-subject');
    expect(mine.status).toBe(200);
    const mineBody = await mine.json() as { referral: { code: string; bonusVoiceCredits: number; successfulReferrals: number } };
    expect(mineBody.referral.code).toMatch(/^[A-Z0-9]{8}$/u);
    expect(mineBody.referral).toMatchObject({ bonusVoiceCredits: 0, successfulReferrals: 0 });

    const claim = await call('/v1/referrals/claim', 'POST', { code: mineBody.referral.code, inviterUserId: 'forged' }, 'referred-subject');
    expect(claim.status).toBe(200);
    expect(await claim.json()).toMatchObject({ referral: { claimedCode: mineBody.referral.code }, replayed: false });

    const replay = await call('/v1/referrals/claim', 'POST', { code: mineBody.referral.code }, 'referred-subject');
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ replayed: true });
    const row = await db.prepare('SELECT inviter_user_id FROM referral_claims').first<{ inviter_user_id: string }>();
    expect(row?.inviter_user_id).toBe(inviter.id);
  });

  it('rejects claiming a referral after the account is already Plus', async () => {
    const inviter = await new D1UserRepository(db).resolveOrCreate('plus-inviter-subject');
    const referred = await new D1UserRepository(db).resolveOrCreate('already-plus-subject');
    await db.prepare(`INSERT INTO referral_codes (user_id, code) VALUES (?, 'BEFOREPLUS')`).bind(inviter.id).run();
    await db.prepare(`INSERT INTO user_entitlements (user_id, tier, provider_request_date_ms, synced_at) VALUES (?, 'plus', ?, ?)`).bind(referred.id, Date.now(), Date.now()).run();

    const response = await call('/v1/referrals/claim', 'POST', { code: 'BEFOREPLUS' }, 'already-plus-subject');
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'plus_already_active' });
    expect(await db.prepare('SELECT COUNT(*) AS count FROM referral_claims').first<{ count: number }>()).toEqual({ count: 0 });
  });

  it('rejects self-referral and an unknown code without creating credits', async () => {
    await new D1UserRepository(db).resolveOrCreate('owner-subject');
    const mine = await call('/v1/referrals/me', 'GET', undefined, 'owner-subject');
    const code = ((await mine.json()) as { referral: { code: string } }).referral.code;

    expect((await call('/v1/referrals/claim', 'POST', { code }, 'owner-subject')).status).toBe(400);
    expect((await call('/v1/referrals/claim', 'POST', { code: 'ZZZZZZZZ' }, 'owner-subject')).status).toBe(404);
    const accountCount = await db.prepare('SELECT COUNT(*) AS count FROM voice_bonus_accounts').first<{ count: number }>();
    expect(accountCount?.count).toBe(0);
  });
});

async function call(path: string, method: string, body: unknown, subject: string): Promise<Response> {
  return handleRequest(new Request(`https://living-plot.test${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), testEnv, { sessionVerifier: verifier(subject) });
}

function verifier(subject: string): SessionVerifier {
  return { async authenticate() { return { subject }; } };
}
