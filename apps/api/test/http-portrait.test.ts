import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import migrationOne from '../migrations/0001_initial.sql?raw';
import migrationTwo from '../migrations/0002_episode_publication.sql?raw';
import migrationThree from '../migrations/0003_choice_commit.sql?raw';
import migrationSeven from '../migrations/0007_live_story_integration.sql?raw';
import migrationTen from '../migrations/0010_referrals_portraits.sql?raw';
import type { SessionVerifier } from '../src/auth/session-verifier';
import type { AppEnv } from '../src/env';
import { handleRequest } from '../src/http/app';
import { applySqlMigration, resetStoryData } from './d1-test-utils';

const runtimeEnv = env as unknown as AppEnv;
const db = runtimeEnv.DB;
const testEnv: AppEnv = {
  ...runtimeEnv,
  CLERK_JWT_KEY: 'unused', CLERK_AUTHORIZED_PARTIES: 'https://living-plot.test',
  GEMINI_API_KEY: 'unused',
  REVENUECAT_SECRET_API_KEY: 'unused', REVENUECAT_PLUS_ENTITLEMENT_ID: 'plus',
  REVENUECAT_WEBHOOK_AUTHORIZATION: 'Bearer unused', REVENUECAT_WEBHOOK_SIGNING_SECRET: 'unused',
};

beforeAll(async () => {
  for (const migration of [migrationOne, migrationTwo, migrationThree, migrationSeven, migrationTen]) {
    await applySqlMigration(db, migration);
  }
});

beforeEach(async () => {
  await resetStoryData(db);
  const listed = await runtimeEnv.AUDIO_BUCKET.list({ prefix: 'portraits/' });
  await Promise.all(listed.objects.map((object) => runtimeEnv.AUDIO_BUCKET.delete(object.key)));
  await seedPortrait();
});

describe('private character portrait HTTP boundary', () => {
  it('returns client-safe status without object/provider details', async () => {
    const response = await call('/v1/dramas/plot-portrait/portrait/status', 'GET', 'owner-subject');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ portrait: { status: 'ready', current: true, attempts: 1 } });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('portraits/plot-portrait/private.jpg');
    expect(serialized).not.toContain('flux');
  });

  it('streams private JPEG only to the owning authenticated account', async () => {
    const owner = await call('/v1/dramas/plot-portrait/portrait', 'GET', 'owner-subject');
    expect(owner.status).toBe(200);
    expect(owner.headers.get('Content-Type')).toBe('image/jpeg');
    expect(owner.headers.get('Cache-Control')).toContain('private');
    expect((await owner.arrayBuffer()).byteLength).toBeGreaterThan(256);

    const attacker = await call('/v1/dramas/plot-portrait/portrait', 'GET', 'attacker-subject');
    expect(attacker.status).toBe(404);
    expect(await attacker.json()).toEqual({ error: 'not_found' });
  });
});

async function seedPortrait(): Promise<void> {
  await db.prepare(`INSERT INTO users (id, auth_subject) VALUES ('owner-id', 'owner-subject'), ('attacker-id', 'attacker-subject')`).run();
  await db.prepare(`INSERT INTO plots (id, user_id, title, premise, mood, summary) VALUES ('plot-portrait', 'owner-id', 'Portrait', 'Mina follows a private signal.', 'mysterious', 'Mina is following the signal.')`).run();
  await db.prepare(`INSERT INTO characters (id, plot_id, name, role, traits_json) VALUES ('character-portrait', 'plot-portrait', 'Mina', 'protagonist', '{}')`).run();
  await db.prepare(`INSERT INTO episodes (id, plot_id, episode_number, title, script_json, summary) VALUES ('episode-portrait', 'plot-portrait', 1, 'Signal', '{"script":"signal"}', 'Mina is following the signal.')`).run();

  const fingerprint = await fingerprintForCurrentContext();
  await db.prepare(
    `INSERT INTO character_portraits
       (plot_id, character_id, story_fingerprint, object_key, status, attempts, ready_at)
     VALUES ('plot-portrait', 'character-portrait', ?, 'portraits/plot-portrait/private.jpg', 'ready', 1, ?)`,
  ).bind(fingerprint, Date.now()).run();
  await runtimeEnv.AUDIO_BUCKET.put('portraits/plot-portrait/private.jpg', new Uint8Array(320).fill(9), { httpMetadata: { contentType: 'image/jpeg' } });
}

async function fingerprintForCurrentContext(): Promise<string> {
  const payload = JSON.stringify({
    characterId: 'character-portrait',
    characterName: 'Mina',
    traits: '',
    premise: 'Mina follows a private signal.',
    mood: 'mysterious',
    plotSummary: 'Mina is following the signal.',
    episodeNumber: 1,
    episodeTitle: 'Signal',
    sceneSummary: 'Mina is following the signal.',
    committedChoice: null,
    committedIntent: null,
    committedConsequence: null,
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest)).slice(0, 16).map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function call(path: string, method: string, subject: string): Promise<Response> {
  return handleRequest(new Request(`https://living-plot.test${path}`, { method }), testEnv, { sessionVerifier: verifier(subject) });
}

function verifier(subject: string): SessionVerifier {
  return { async authenticate() { return { subject }; } };
}
