import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import migrationOne from '../migrations/0001_initial.sql?raw';
import migrationTwo from '../migrations/0002_episode_publication.sql?raw';
import migrationThree from '../migrations/0003_choice_commit.sql?raw';
import migrationSeven from '../migrations/0007_live_story_integration.sql?raw';
import migrationTwelve from '../migrations/0012_scene_artworks.sql?raw';
import { D1SceneArtworkService } from '../src/artwork/d1-scene-artwork-service';
import { SCENE_ARTWORK_FALLBACK_MODEL, SCENE_ARTWORK_MODEL } from '../src/artwork/contracts';
import type { AppEnv } from '../src/env';
import { applySqlMigration, resetStoryData } from './d1-test-utils';

const runtimeEnv = env as unknown as AppEnv;
const db = runtimeEnv.DB;
const bucket = runtimeEnv.AUDIO_BUCKET;

beforeAll(async () => {
  for (const migration of [migrationOne, migrationTwo, migrationThree, migrationSeven, migrationTwelve]) {
    await applySqlMigration(db, migration);
  }
});

beforeEach(async () => {
  await resetStoryData(db);
  const listed = await bucket.list({ prefix: 'scene-artworks/' });
  await Promise.all(listed.objects.map((object) => bucket.delete(object.key)));
  await seedScene();
});

describe('D1SceneArtworkService', () => {
  it('renders the canonical Scene once, stores it privately, and replays the same fingerprint', async () => {
    const ai = fakeArtworkAi();
    const service = new D1SceneArtworkService(db, bucket, ai.value);

    expect(await service.status('user-1', 'scene-1')).toMatchObject({ ok: true, value: { status: 'missing' } });
    const first = await service.generate('user-1', 'scene-1');
    const replay = await service.generate('user-1', 'scene-1');

    expect(first).toMatchObject({ ok: true, value: { status: 'ready', current: true, attempts: 1 }, replayed: false });
    expect(replay).toMatchObject({ ok: true, value: { status: 'ready', current: true }, replayed: true });
    expect(ai.models()).toEqual([SCENE_ARTWORK_MODEL]);
    expect(ai.prompts()[0]).toContain('Mina opens the impossible brass door beneath the rain clock');
    expect(ai.prompts()[0]).toContain('do not force a castle, forest, or medieval setting unless the story says so');
    expect(ai.prompts()[0]).toContain('width');
    expect(ai.prompts()[0]).toContain('1024');
    expect(ai.prompts()[0]).toContain('height');
    expect(ai.prompts()[0]).toContain('640');

    const delivery = await service.delivery('user-1', 'scene-1');
    expect(delivery.ok).toBe(true);
    if (!delivery.ok || !delivery.value.objectKey) return;
    expect(delivery.value.objectKey).toMatch(/^scene-artworks\/plot-1\/scene-1\/[a-f0-9]{32}\/[a-f0-9-]+\.jpg$/u);
    const stored = await bucket.get(delivery.value.objectKey);
    expect(stored?.httpMetadata?.contentType).toBe('image/jpeg');
    expect((await stored?.arrayBuffer())?.byteLength).toBeGreaterThan(256);
  });

  it('uses one hosted fallback only when the primary artwork model fails', async () => {
    const ai = fakeArtworkAi({ failPrimary: true });
    const result = await new D1SceneArtworkService(db, bucket, ai.value).generate('user-1', 'scene-1');

    expect(result).toMatchObject({ ok: true, value: { status: 'ready', attempts: 1 } });
    expect(ai.models()).toEqual([SCENE_ARTWORK_MODEL, SCENE_ARTWORK_FALLBACK_MODEL]);
    const row = await db
      .prepare("SELECT model, status FROM scene_artworks WHERE scene_id = 'scene-1'")
      .first<{ model: string; status: string }>();
    expect(row).toEqual({ model: SCENE_ARTWORK_FALLBACK_MODEL, status: 'ready' });
  });

  it('converges concurrent requests for one Scene fingerprint to one provider call', async () => {
    const ai = fakeArtworkAi();
    const service = new D1SceneArtworkService(db, bucket, ai.value);

    const [left, right] = await Promise.all([
      service.generate('user-1', 'scene-1'),
      service.generate('user-1', 'scene-1'),
    ]);

    expect(left.ok).toBe(true);
    expect(right.ok).toBe(true);
    expect(ai.models()).toEqual([SCENE_ARTWORK_MODEL]);
  });

  it('serves a prior ready image as stale while changed canonical Scene content is regenerated', async () => {
    const first = new D1SceneArtworkService(db, bucket, fakeArtworkAi().value);
    expect((await first.generate('user-1', 'scene-1')).ok).toBe(true);
    await db.prepare("UPDATE episodes SET summary = 'Mina discovers the rain clock is counting backward.' WHERE id = 'scene-1'").run();

    expect(await first.status('user-1', 'scene-1')).toMatchObject({ ok: true, value: { status: 'stale', current: false } });
    const secondAi = fakeArtworkAi();
    const refreshed = await new D1SceneArtworkService(db, bucket, secondAi.value).generate('user-1', 'scene-1');
    expect(refreshed).toMatchObject({ ok: true, value: { status: 'ready', current: true } });
    expect(secondAi.models()).toEqual([SCENE_ARTWORK_MODEL]);
    const count = await db.prepare("SELECT COUNT(*) AS count FROM scene_artworks WHERE scene_id = 'scene-1'").first<{ count: number }>();
    expect(count?.count).toBe(2);
  });

  it('keeps invalid media derived and leaves the canonical Scene untouched', async () => {
    const ai = fakeArtworkAi({ invalidImages: true });
    const result = await new D1SceneArtworkService(db, bucket, ai.value).generate('user-1', 'scene-1');

    expect(result).toMatchObject({ ok: false, error: { code: 'invalid_response' } });
    expect(ai.models()).toEqual([SCENE_ARTWORK_MODEL, SCENE_ARTWORK_FALLBACK_MODEL]);
    expect(await db.prepare("SELECT status, attempts FROM scene_artworks WHERE scene_id = 'scene-1'").first()).toEqual({ status: 'failed', attempts: 1 });
    expect(await db.prepare("SELECT title, summary FROM episodes WHERE id = 'scene-1'").first()).toEqual({
      title: 'The Rain Clock',
      summary: 'Mina crosses the flooded station and opens a brass door that should not exist.',
    });
  });

  it('enforces owner isolation and treats an absent AI binding as fail-open media unavailability', async () => {
    const service = new D1SceneArtworkService(db, bucket, undefined);
    expect(await service.status('attacker', 'scene-1')).toMatchObject({ ok: false, error: { code: 'not_found' } });
    expect(await service.generate('attacker', 'scene-1')).toMatchObject({ ok: false, error: { code: 'not_found' } });
    expect(await service.generate('user-1', 'scene-1')).toMatchObject({ ok: false, error: { code: 'provider_unavailable' } });
    expect(await db.prepare("SELECT COUNT(*) AS count FROM scene_artworks").first<{ count: number }>()).toEqual({ count: 0 });
  });
});

function fakeArtworkAi(options: { failPrimary?: boolean; invalidImages?: boolean } = {}) {
  const models: string[] = [];
  const prompts: string[] = [];
  const bytes = new Uint8Array(384).fill(11);
  bytes.set([0xff, 0xd8, 0xff, 0xe0], 0);
  const image = btoa(String.fromCharCode(...bytes));
  const value = {
    async run(model: string, input: { multipart?: { body?: unknown; contentType?: string }; prompt?: string; steps?: number }) {
      models.push(model);
      if (model === SCENE_ARTWORK_MODEL) {
        if (options.failPrimary) throw new Error('primary unavailable');
        expect(input.multipart?.contentType).toMatch(/^multipart\/form-data; boundary=/u);
        const body = input.multipart?.body;
        prompts.push(body instanceof ReadableStream ? await new Response(body).text() : '');
        return options.invalidImages ? {} : { image };
      }
      expect(model).toBe(SCENE_ARTWORK_FALLBACK_MODEL);
      expect(input.steps).toBe(4);
      prompts.push(input.prompt ?? '');
      return options.invalidImages ? {} : { image };
    },
  } as unknown as Ai;
  return { value, models: () => models, prompts: () => prompts };
}

async function seedScene(): Promise<void> {
  await db.prepare("INSERT INTO users (id) VALUES ('user-1')").run();
  await db.prepare(
    `INSERT INTO plots (id, user_id, title, premise, mood, summary)
     VALUES ('plot-1', 'user-1', 'The Rain Clock', 'A city clock starts counting backward whenever someone lies.', 'mysterious', 'Mina follows the impossible clock.')`,
  ).run();
  await db.prepare(
    `INSERT INTO characters (id, plot_id, name, role, traits_json)
     VALUES ('character-1', 'plot-1', 'Mina', 'protagonist', '{"temperament":"observant","goal":"find her missing sister"}')`,
  ).run();
  await db.prepare(
    `INSERT INTO episodes (id, plot_id, episode_number, title, script_json, summary)
     VALUES ('scene-1', 'plot-1', 1, 'The Rain Clock',
       '{"script":"Mina opens the impossible brass door beneath the rain clock while floodwater rises around the abandoned station."}',
       'Mina crosses the flooded station and opens a brass door that should not exist.')`,
  ).run();
}
