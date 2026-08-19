import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import migrationOne from '../migrations/0001_initial.sql?raw';
import migrationSix from '../migrations/0006_revenuecat_entitlements.sql?raw';
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
  CLERK_PUBLISHABLE_KEY: 'unused',
  CLERK_JWT_KEY: 'unused',
  CLERK_AUTHORIZED_PARTIES: 'https://living-plot.test',
  GEMINI_API_KEY: 'unused',
  REVENUECAT_SECRET_API_KEY: 'server-secret-unused-with-injected-provider',
  REVENUECAT_PLUS_ENTITLEMENT_ID: 'plus',
  REVENUECAT_WEBHOOK_AUTHORIZATION: WEBHOOK_AUTHORIZATION,
  REVENUECAT_WEBHOOK_SIGNING_SECRET: WEBHOOK_SIGNING_SECRET,
};

beforeAll(async () => {
  for (const migration of [migrationOne, migrationSix]) {
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
