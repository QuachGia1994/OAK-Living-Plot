import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import migrationOne from '../migrations/0001_initial.sql?raw';
import migrationSix from '../migrations/0006_revenuecat_entitlements.sql?raw';
import migrationTen from '../migrations/0010_referrals_portraits.sql?raw';
import type { RevenueCatSubscriberProvider } from '../src/billing/contracts';
import type { SessionVerifier } from '../src/auth/session-verifier';
import type { AppEnv } from '../src/env';
import { handleRequest } from '../src/http/app';
import { D1UserRepository } from '../src/persistence/d1-user-repository';
import { applySqlMigration, resetStoryData } from './d1-test-utils';
import {
  providerSnapshot,
  revenueCatWebhookPayload,
  signedWebhookRequest,
  WEBHOOK_AUTHORIZATION,
  WEBHOOK_NOW_MS,
  WEBHOOK_SIGNING_SECRET,
} from './billing-fixtures';

const runtimeEnv = env as unknown as AppEnv;
const db = runtimeEnv.DB;
const testEnv: AppEnv = {
  ...runtimeEnv,
  CLERK_JWT_KEY: 'unused',
  CLERK_AUTHORIZED_PARTIES: 'https://living-plot.test',
  GEMINI_API_KEY: 'unused',
  REVENUECAT_SECRET_API_KEY: 'server-secret-unused-with-injected-provider',
  REVENUECAT_PLUS_ENTITLEMENT_ID: 'plus',
  REVENUECAT_WEBHOOK_AUTHORIZATION: WEBHOOK_AUTHORIZATION,
  REVENUECAT_WEBHOOK_SIGNING_SECRET: WEBHOOK_SIGNING_SECRET,
};

beforeAll(async () => {
  for (const migration of [migrationOne, migrationSix, migrationTen]) {
    await applySqlMigration(db, migration);
  }
});

beforeEach(async () => {
  await resetStoryData(db);
});

describe('RevenueCat HTTP trust boundary', () => {
  it('materializes Plus only after a verified webhook and provider refresh', async () => {
    const owner = await new D1UserRepository(db).resolveOrCreate('clerk-owner');
    const provider = fakeProvider(owner.id, 'plus');

    const response = await handleRequest(
      await signedWebhookRequest(revenueCatWebhookPayload(owner.id)),
      testEnv,
      { revenueCatSubscriberProvider: provider, revenueCatWebhookClock: () => WEBHOOK_NOW_MS },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      accepted: true,
      replayed: false,
      entitlement: { tier: 'plus', plusActive: true },
    });
    expect(provider.calls).toBe(1);

    const entitlement = await handleRequest(new Request('https://living-plot.test/v1/entitlement'), testEnv, {
      sessionVerifier: verifier('clerk-owner'),
    });
    expect(entitlement.status).toBe(200);
    expect(await entitlement.json()).toMatchObject({ entitlement: { tier: 'plus', plusActive: true } });
  });

  it('grants the inviter fifty persistent voice credits only when the referred account activates Plus', async () => {
    const inviter = await new D1UserRepository(db).resolveOrCreate('clerk-inviter');
    const referred = await new D1UserRepository(db).resolveOrCreate('clerk-referred');
    await db.prepare(`INSERT INTO referral_codes (user_id, code) VALUES (?, 'SHAREPLUS1')`).bind(inviter.id).run();
    await db.prepare(`INSERT INTO referral_claims (referred_user_id, inviter_user_id, code, claimed_at) VALUES (?, ?, 'SHAREPLUS1', ?)`).bind(referred.id, inviter.id, WEBHOOK_NOW_MS - 60_000).run();
    const provider = fakeProvider(referred.id, 'plus');

    const first = await handleRequest(
      await signedWebhookRequest(revenueCatWebhookPayload(referred.id, 'rc-referral-plus')),
      testEnv,
      { revenueCatSubscriberProvider: provider, revenueCatWebhookClock: () => WEBHOOK_NOW_MS },
    );
    const replay = await handleRequest(
      await signedWebhookRequest(revenueCatWebhookPayload(referred.id, 'rc-referral-plus')),
      testEnv,
      { revenueCatSubscriberProvider: provider, revenueCatWebhookClock: () => WEBHOOK_NOW_MS },
    );

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    const balance = await db.prepare('SELECT available_credits, earned_credits FROM voice_bonus_accounts WHERE user_id = ?').bind(inviter.id).first<{ available_credits: number; earned_credits: number }>();
    expect(balance).toEqual({ available_credits: 50, earned_credits: 50 });
    const claim = await db.prepare('SELECT reward_event_id, reward_granted_at FROM referral_claims WHERE referred_user_id = ?').bind(referred.id).first<{ reward_event_id: string | null; reward_granted_at: number | null }>();
    expect(claim?.reward_event_id).toBe('rc-referral-plus');
    expect(claim?.reward_granted_at).not.toBeNull();
  });

  it('does not grant a referral reward for a renewal-only webhook even when provider state is Plus', async () => {
    const inviter = await new D1UserRepository(db).resolveOrCreate('renewal-inviter');
    const referred = await new D1UserRepository(db).resolveOrCreate('renewal-referred');
    await db.prepare(`INSERT INTO referral_codes (user_id, code) VALUES (?, 'RENEWPLUS1')`).bind(inviter.id).run();
    await db.prepare(`INSERT INTO referral_claims (referred_user_id, inviter_user_id, code, claimed_at) VALUES (?, ?, 'RENEWPLUS1', ?)`).bind(referred.id, inviter.id, WEBHOOK_NOW_MS - 60_000).run();
    const provider = fakeProvider(referred.id, 'plus');

    const response = await handleRequest(
      await signedWebhookRequest(revenueCatWebhookPayload(referred.id, 'rc-renewal-only', 'RENEWAL')),
      testEnv,
      { revenueCatSubscriberProvider: provider, revenueCatWebhookClock: () => WEBHOOK_NOW_MS },
    );

    expect(response.status).toBe(200);
    const balance = await db.prepare('SELECT available_credits FROM voice_bonus_accounts WHERE user_id = ?').bind(inviter.id).first<{ available_credits: number }>();
    expect(balance).toBeNull();
    const claim = await db.prepare('SELECT reward_event_id FROM referral_claims WHERE referred_user_id = ?').bind(referred.id).first<{ reward_event_id: string | null }>();
    expect(claim?.reward_event_id).toBeNull();
  });

  it('deduplicates the same event id before a second provider lookup', async () => {
    const owner = await new D1UserRepository(db).resolveOrCreate('clerk-owner');
    const provider = fakeProvider(owner.id, 'plus');
    const payload = revenueCatWebhookPayload(owner.id, 'rc-event-repeat');

    const first = await handleRequest(await signedWebhookRequest(payload), testEnv, {
      revenueCatSubscriberProvider: provider,
      revenueCatWebhookClock: () => WEBHOOK_NOW_MS,
    });
    const second = await handleRequest(await signedWebhookRequest(payload), testEnv, {
      revenueCatSubscriberProvider: provider,
      revenueCatWebhookClock: () => WEBHOOK_NOW_MS,
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ accepted: true, replayed: true });
    expect(provider.calls).toBe(1);
    const count = await db.prepare('SELECT COUNT(*) AS count FROM revenuecat_events').first<{ count: number }>();
    expect(count?.count).toBe(1);
  });

  it('rejects an invalid HMAC before provider or D1 entitlement work', async () => {
    const owner = await new D1UserRepository(db).resolveOrCreate('clerk-owner');
    const provider = fakeProvider(owner.id, 'plus');

    const response = await handleRequest(
      await signedWebhookRequest(revenueCatWebhookPayload(owner.id), { signingSecret: 'wrong-secret' }),
      testEnv,
      { revenueCatSubscriberProvider: provider, revenueCatWebhookClock: () => WEBHOOK_NOW_MS },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'invalid_signature' });
    expect(provider.calls).toBe(0);
    const count = await db.prepare('SELECT COUNT(*) AS count FROM revenuecat_events').first<{ count: number }>();
    expect(count?.count).toBe(0);
  });

  it('fails webhook processing when RevenueCat refresh is unavailable so RevenueCat can retry', async () => {
    const owner = await new D1UserRepository(db).resolveOrCreate('clerk-owner');
    const provider: RevenueCatSubscriberProvider = {
      async fetchEntitlement() {
        return { ok: false, error: { code: 'provider_unavailable', message: 'down', retryable: true } };
      },
    };

    const response = await handleRequest(
      await signedWebhookRequest(revenueCatWebhookPayload(owner.id, 'rc-event-provider-down')),
      testEnv,
      { revenueCatSubscriberProvider: provider, revenueCatWebhookClock: () => WEBHOOK_NOW_MS },
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'revenuecat_unavailable' });
    const count = await db.prepare('SELECT COUNT(*) AS count FROM revenuecat_events').first<{ count: number }>();
    expect(count?.count).toBe(0);
  });

  it('returns Free from the protected endpoint when no verified entitlement exists', async () => {
    await new D1UserRepository(db).resolveOrCreate('clerk-owner');

    const response = await handleRequest(new Request('https://living-plot.test/v1/entitlement'), testEnv, {
      sessionVerifier: verifier('clerk-owner'),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      entitlement: { tier: 'free', plusActive: false, expiresAt: null, syncedAt: null },
    });
  });
});

function fakeProvider(appUserId: string, tier: 'free' | 'plus') {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    async fetchEntitlement(requestedAppUserId: string) {
      calls += 1;
      expect(requestedAppUserId).toBe(appUserId);
      return { ok: true as const, value: providerSnapshot(appUserId, tier) };
    },
  };
}

function verifier(subject: string): SessionVerifier {
  return { async authenticate() { return { subject }; } };
}
