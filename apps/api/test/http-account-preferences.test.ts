import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import migrationOne from '../migrations/0001_initial.sql?raw';
import migrationTwo from '../migrations/0002_episode_publication.sql?raw';
import migrationThree from '../migrations/0003_choice_commit.sql?raw';
import migrationFour from '../migrations/0004_quota_ledger.sql?raw';
import migrationFive from '../migrations/0005_tts_audio.sql?raw';
import migrationSix from '../migrations/0006_revenuecat_entitlements.sql?raw';
import migrationSeven from '../migrations/0007_live_story_integration.sql?raw';
import migrationEight from '../migrations/0008_user_preferences.sql?raw';
import type { SessionVerifier } from '../src/auth/session-verifier';
import type { AppEnv } from '../src/env';
import { handleRequest } from '../src/http/app';
import { D1UserRepository } from '../src/persistence/d1-user-repository';
import { applySqlMigration, resetStoryData } from './d1-test-utils';

const runtimeEnv = env as unknown as AppEnv;
const db = runtimeEnv.DB;
const testEnv: AppEnv = {
  ...runtimeEnv,
  CLERK_PUBLISHABLE_KEY: 'unused', CLERK_JWT_KEY: 'unused', CLERK_AUTHORIZED_PARTIES: 'https://living-plot.test',
  GEMINI_API_KEY: 'unused', GOOGLE_SERVICE_ACCOUNT_EMAIL: 'unused', GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: 'unused',
  REVENUECAT_SECRET_API_KEY: 'unused', REVENUECAT_PLUS_ENTITLEMENT_ID: 'plus',
  REVENUECAT_WEBHOOK_AUTHORIZATION: 'Bearer unused', REVENUECAT_WEBHOOK_SIGNING_SECRET: 'unused',
};

beforeAll(async () => {
  for (const migration of [migrationOne, migrationTwo, migrationThree, migrationFour, migrationFive, migrationSix, migrationSeven, migrationEight]) {
    await applySqlMigration(db, migration);
  }
});

beforeEach(async () => {
  await resetStoryData(db);
  const listed = await runtimeEnv.AUDIO_BUCKET.list();
  await Promise.all(listed.objects.map((object) => runtimeEnv.AUDIO_BUCKET.delete(object.key)));
});

describe('preferences and account data boundary', () => {
  it('loads defaults, saves only the authenticated owner preferences, and rejects unsupported values', async () => {
    const defaults = await call('/v1/preferences', 'GET', undefined, 'owner');
    expect(defaults.status).toBe(200);
    expect(await defaults.json()).toEqual({ preferences: { uiLocale: 'en', storyLocale: 'en-US', narratorVariant: 'en-narrator-female', updatedAt: null } });

    const saved = await call('/v1/preferences', 'POST', {
      uiLocale: 'vi', storyLocale: 'vi-VN', narratorVariant: 'vi-narrator-female', userId: 'forged-user',
    }, 'owner');
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ preferences: expect.objectContaining({ uiLocale: 'vi', storyLocale: 'vi-VN', narratorVariant: 'vi-narrator-female' }) });

    const other = await call('/v1/preferences', 'GET', undefined, 'other');
    expect(await other.json()).toEqual({ preferences: { uiLocale: 'en', storyLocale: 'en-US', narratorVariant: 'en-narrator-female', updatedAt: null } });

    const invalid = await call('/v1/preferences', 'POST', { uiLocale: 'fr', storyLocale: 'fr-FR', narratorVariant: 'arbitrary-provider-voice' }, 'owner');
    expect(invalid.status).toBe(400);
  });

  it('exports portable owner data without auth/provider/private-object secrets', async () => {
    const owner = await seedOwnedStory('owner-auth-subject');
    await db.prepare(`INSERT INTO user_preferences (user_id, ui_locale, story_locale, narrator_variant) VALUES (?, 'vi', 'vi-VN', 'vi-narrator-female')`).bind(owner.id).run();
    await db.prepare(`INSERT INTO user_entitlements (user_id, tier, plus_expires_at, provider_request_date_ms) VALUES (?, 'plus', ?, ?)`).bind(owner.id, Date.now() + 60_000, Date.now()).run();

    const response = await call('/v1/account/export', 'GET', undefined, 'owner-auth-subject');
    expect(response.status).toBe(200);
    const body = await response.json() as { export: Record<string, unknown> };
    const serialized = JSON.stringify(body);
    expect(body.export).toMatchObject({ schemaVersion: 1, preferences: { uiLocale: 'vi', storyLocale: 'vi-VN' } });
    expect(serialized).toContain('A portable episode script.');
    expect(serialized).not.toContain('private/audio/object.mp3');
    expect(serialized).not.toContain('provider-secret-voice-id');
    expect(serialized).not.toContain('owner-auth-subject');
    expect(serialized).not.toContain('reservation-export-001');
  });

  it('requires the exact deletion phrase and removes private audio before D1 cascade', async () => {
    const owner = await seedOwnedStory('owner-auth-subject');
    await seedCascadingAccountRows(owner.id);
    await runtimeEnv.AUDIO_BUCKET.put('private/audio/object.mp3', new TextEncoder().encode('audio'));

    const wrong = await call('/v1/account/delete', 'POST', { confirmation: 'DELETE' }, 'owner-auth-subject');
    expect(wrong.status).toBe(400);
    expect(await db.prepare('SELECT id FROM users WHERE id = ?').bind(owner.id).first()).not.toBeNull();

    const deleted = await call('/v1/account/delete', 'POST', { confirmation: 'DELETE MY LIVING PLOT DATA' }, 'owner-auth-subject');
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ deleted: true });
    expect(await runtimeEnv.AUDIO_BUCKET.get('private/audio/object.mp3')).toBeNull();
    expect(await db.prepare('SELECT id FROM users WHERE id = ?').bind(owner.id).first()).toBeNull();
    expect(await db.prepare('SELECT id FROM plots WHERE user_id = ?').bind(owner.id).first()).toBeNull();
    expect(await db.prepare('SELECT user_id FROM user_preferences WHERE user_id = ?').bind(owner.id).first()).toBeNull();
    expect(await db.prepare('SELECT user_id FROM daily_usage WHERE user_id = ?').bind(owner.id).first()).toBeNull();
    expect(await db.prepare('SELECT user_id FROM usage_events WHERE user_id = ?').bind(owner.id).first()).toBeNull();
    expect(await db.prepare('SELECT user_id FROM quota_reservations WHERE user_id = ?').bind(owner.id).first()).toBeNull();
    expect(await db.prepare('SELECT user_id FROM revenuecat_events WHERE user_id = ?').bind(owner.id).first()).toBeNull();
    expect(await db.prepare('SELECT user_id FROM user_entitlements WHERE user_id = ?').bind(owner.id).first()).toBeNull();
  });

  it('fails closed and keeps canonical D1 data when private audio cleanup fails', async () => {
    const owner = await seedOwnedStory('owner-fail');
    const failingBucket = { ...runtimeEnv.AUDIO_BUCKET, async delete() { throw new Error('r2 down'); } } as unknown as R2Bucket;
    const response = await handleRequest(request('/v1/account/delete', 'POST', { confirmation: 'DELETE MY LIVING PLOT DATA' }), { ...testEnv, AUDIO_BUCKET: failingBucket }, {
      sessionVerifier: verifier('owner-fail'),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'audio_cleanup_failed' });
    expect(await db.prepare('SELECT id FROM users WHERE id = ?').bind(owner.id).first()).not.toBeNull();
    expect(await db.prepare('SELECT id FROM plots WHERE user_id = ?').bind(owner.id).first()).not.toBeNull();
  });
});

async function seedOwnedStory(subject: string) {
  const user = await new D1UserRepository(db).resolveOrCreate(subject);
  await db.prepare(`INSERT INTO plots (id, user_id, title, premise, locale, mood) VALUES ('plot-export', ?, 'Portable plot', 'A premise safe for export.', 'en-US', 'mysterious')`).bind(user.id).run();
  await db.prepare(`INSERT INTO characters (id, plot_id, name, role, traits_json) VALUES ('character-export', 'plot-export', 'Mina', 'protagonist', '{"goal":"truth"}')`).run();
  await db.prepare(`INSERT INTO episodes (id, plot_id, episode_number, title, script_json, summary, status) VALUES ('episode-export', 'plot-export', 1, 'Export episode', '{"script":"A portable episode script."}', 'Portable summary.', 'ready')`).run();
  await db.prepare(`INSERT INTO episode_choices (id, episode_id, position, label, choice_key, intent, consequence) VALUES ('choice-export-a', 'episode-export', 1, 'Open the door', 'A', 'confront', 'The visitor is revealed.')`).run();
  await db.prepare(`INSERT INTO audio_assets (id, episode_id, voice_variant, provider, provider_voice_id, language_code, reservation_key, object_key, status, input_characters, ready_at) VALUES ('audio-export', 'episode-export', 'en-narrator-female', 'google', 'provider-secret-voice-id', 'en-US', 'reservation-export-001', 'private/audio/object.mp3', 'ready', 25, ?)`).bind(Date.now()).run();
  return user;
}

async function seedCascadingAccountRows(userId: string): Promise<void> {
  await db.prepare(`INSERT INTO user_preferences (user_id) VALUES (?)`).bind(userId).run();
  await db.prepare(`INSERT INTO daily_usage (user_id, usage_date, text_episodes, voiced_episodes) VALUES (?, '2026-08-17', 1, 1)`).bind(userId).run();
  await db.prepare(`INSERT INTO usage_events (id, user_id, utc_day, resource_type, event_type, reservation_key) VALUES ('usage-delete', ?, '2026-08-17', 'text_episode', 'reserved', 'reservation-delete-001')`).bind(userId).run();
  await db.prepare(`INSERT INTO quota_reservations (id, user_id, reservation_key, utc_day, resource_type, status, last_event_id) VALUES ('quota-delete', ?, 'reservation-delete-001', '2026-08-17', 'text_episode', 'reserved', 'usage-delete')`).bind(userId).run();
  await db.prepare(`INSERT INTO revenuecat_events (id, ingest_token, user_id, event_type, event_timestamp_ms, provider_request_date_ms, tier_after) VALUES ('rc-delete', 'rc-ingest-delete', ?, 'INITIAL_PURCHASE', 1, 1, 'plus')`).bind(userId).run();
  await db.prepare(`INSERT INTO user_entitlements (user_id, tier, provider_request_date_ms, source_event_id) VALUES (?, 'plus', 1, 'rc-delete')`).bind(userId).run();
}

async function call(path: string, method: string, body: unknown, subject: string) {
  return handleRequest(request(path, method, body), testEnv, { sessionVerifier: verifier(subject) });
}

function verifier(subject: string): SessionVerifier { return { async authenticate() { return { subject }; } }; }

function request(path: string, method: string, body?: unknown): Request {
  return new Request(`https://living-plot.test${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
