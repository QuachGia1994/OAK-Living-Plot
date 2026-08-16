import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import migrationOne from '../migrations/0001_initial.sql?raw';
import migrationSix from '../migrations/0006_revenuecat_entitlements.sql?raw';
import { D1EntitlementRepository } from '../src/billing/d1-entitlement-repository';
import type { AppEnv } from '../src/env';
import { applySqlMigration, resetStoryData } from './d1-test-utils';
import { providerSnapshot, webhookEvent, WEBHOOK_NOW_MS } from './billing-fixtures';

const db = (env as unknown as AppEnv).DB;

beforeAll(async () => {
  for (const migration of [migrationOne, migrationSix]) {
    await applySqlMigration(db, migration);
  }
});

beforeEach(async () => {
  await resetStoryData(db);
  await db.prepare('INSERT INTO users (id) VALUES (?)').bind('user-1').run();
});

describe('D1EntitlementRepository', () => {
  it('defaults a known user to Free until provider-verified state is materialized', async () => {
    const repository = new D1EntitlementRepository(db, () => WEBHOOK_NOW_MS);

    const entitlement = await repository.getEntitlement('user-1');

    expect(entitlement).toEqual({
      userId: 'user-1',
      tier: 'free',
      plusExpiresAt: null,
      providerRequestDateMs: 0,
      sourceEventId: null,
      syncedAt: 0,
    });
  });

  it('appends a minimal RevenueCat event and materializes Plus', async () => {
    const repository = new D1EntitlementRepository(db, () => WEBHOOK_NOW_MS);

    const result = await repository.applyWebhook(webhookEvent(), providerSnapshot());

    expect(result).toMatchObject({ ok: true, value: { replayed: false, entitlement: { tier: 'plus' } } });
    const event = await db
      .prepare('SELECT id, user_id, event_type, entitlement_ids_json, product_id, transaction_id, tier_after FROM revenuecat_events')
      .first<Record<string, unknown>>();
    expect(event).toMatchObject({
      id: 'rc-event-001',
      user_id: 'user-1',
      event_type: 'INITIAL_PURCHASE',
      product_id: 'oak_plus_monthly',
      transaction_id: 'tx-rc-event-001',
      tier_after: 'plus',
    });
    expect(JSON.parse(String(event?.entitlement_ids_json))).toEqual(['plus']);
  });

  it('treats the same RevenueCat event id as an idempotent replay without changing entitlement again', async () => {
    const repository = new D1EntitlementRepository(db, () => WEBHOOK_NOW_MS);
    const first = await repository.applyWebhook(webhookEvent(), providerSnapshot());
    const second = await repository.applyWebhook(
      webhookEvent(),
      providerSnapshot('user-1', 'free', WEBHOOK_NOW_MS + 10_000),
    );

    expect(first).toMatchObject({ ok: true, value: { replayed: false } });
    expect(second).toMatchObject({ ok: true, value: { replayed: true, entitlement: { tier: 'plus' } } });
    const count = await db.prepare('SELECT COUNT(*) AS count FROM revenuecat_events').first<{ count: number }>();
    expect(count?.count).toBe(1);
  });

  it('does not let an older provider snapshot overwrite newer materialized entitlement state', async () => {
    const repository = new D1EntitlementRepository(db, () => WEBHOOK_NOW_MS);
    await repository.applyWebhook(
      webhookEvent('user-1', 'rc-newer', 'RENEWAL'),
      providerSnapshot('user-1', 'plus', WEBHOOK_NOW_MS + 20_000),
    );

    const older = await repository.applyWebhook(
      webhookEvent('user-1', 'rc-older', 'CANCELLATION'),
      providerSnapshot('user-1', 'free', WEBHOOK_NOW_MS + 10_000),
    );

    expect(older).toMatchObject({ ok: true, value: { entitlement: { tier: 'plus', sourceEventId: 'rc-newer' } } });
    const count = await db.prepare('SELECT COUNT(*) AS count FROM revenuecat_events').first<{ count: number }>();
    expect(count?.count).toBe(2);
  });

  it('fails closed to effective Free when a materialized Plus expiration passes without a new webhook', async () => {
    const repository = new D1EntitlementRepository(db, () => WEBHOOK_NOW_MS + 40 * 24 * 60 * 60 * 1000);
    await db
      .prepare(
        `INSERT INTO user_entitlements
           (user_id, tier, plus_expires_at, provider_request_date_ms, synced_at)
         VALUES (?, 'plus', ?, ?, ?)`,
      )
      .bind('user-1', WEBHOOK_NOW_MS + 30 * 24 * 60 * 60 * 1000, WEBHOOK_NOW_MS, WEBHOOK_NOW_MS)
      .run();

    const entitlement = await repository.getEntitlement('user-1');

    expect(entitlement).toMatchObject({ tier: 'free', plusExpiresAt: null });
  });

  it('fails closed for an App User ID that is not an internal user', async () => {
    const repository = new D1EntitlementRepository(db, () => WEBHOOK_NOW_MS);

    const result = await repository.applyWebhook(
      webhookEvent('missing-user'),
      providerSnapshot('missing-user'),
    );

    expect(result).toEqual({
      ok: false,
      error: { code: 'unknown_user', message: 'RevenueCat App User ID is not a known internal user.' },
    });
    expect(await repository.hasEvent('rc-event-001')).toBe(false);
  });
});
