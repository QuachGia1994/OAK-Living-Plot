import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import migrationOne from '../migrations/0001_initial.sql?raw';
import migrationTwo from '../migrations/0002_episode_publication.sql?raw';
import migrationThree from '../migrations/0003_choice_commit.sql?raw';
import migrationSeven from '../migrations/0007_live_story_integration.sql?raw';
import migrationTen from '../migrations/0010_referrals_portraits.sql?raw';
import type { AppEnv } from '../src/env';
import { D1CharacterPortraitService } from '../src/portrait/d1-character-portrait-service';
import { CHARACTER_PORTRAIT_MODEL } from '../src/portrait/contracts';
import { applySqlMigration, resetStoryData } from './d1-test-utils';

const runtimeEnv = env as unknown as AppEnv;
const db = runtimeEnv.DB;
const bucket = runtimeEnv.AUDIO_BUCKET;

beforeAll(async () => {
  for (const migration of [migrationOne, migrationTwo, migrationThree, migrationSeven, migrationTen]) {
    await applySqlMigration(db, migration);
  }
});

beforeEach(async () => {
  await resetStoryData(db);
  const listed = await bucket.list({ prefix: 'portraits/' });
  await Promise.all(listed.objects.map((object) => bucket.delete(object.key)));
  await seedDrama();
});

describe('D1CharacterPortraitService', () => {
  it('generates one private portrait per story fingerprint and replays without another model call', async () => {
    const ai = fakeImageAi();
    const service = new D1CharacterPortraitService(db, bucket, ai.value);

    expect(await service.status('user-1', 'plot-1')).toMatchObject({ ok: true, value: { status: 'missing' } });
    const first = await service.generate('user-1', 'plot-1');
    const replay = await service.generate('user-1', 'plot-1');

    expect(first).toMatchObject({ ok: true, value: { status: 'ready', current: true }, replayed: false });
    expect(replay).toMatchObject({ ok: true, value: { status: 'ready', current: true }, replayed: true });
    expect(ai.calls()).toBe(1);
    expect(ai.models()).toEqual([CHARACTER_PORTRAIT_MODEL]);
    const delivery = await service.delivery('user-1', 'plot-1');
    expect(delivery.ok).toBe(true);
    if (!delivery.ok || !delivery.value.objectKey) return;
    const object = await bucket.get(delivery.value.objectKey);
    expect(object?.httpMetadata?.contentType).toBe('image/jpeg');
    expect((await object?.arrayBuffer())?.byteLength).toBeGreaterThan(256);
  });

  it('marks the prior portrait stale after story progression and feeds it back as an identity reference', async () => {
    const firstAi = fakeImageAi();
    const firstService = new D1CharacterPortraitService(db, bucket, firstAi.value);
    expect((await firstService.generate('user-1', 'plot-1')).ok).toBe(true);

    await db.prepare(`INSERT INTO episodes (id, plot_id, episode_number, title, script_json, summary) VALUES ('episode-2', 'plot-1', 2, 'A New Threat', '{"script":"new"}', 'Mina learns the caller has entered the building and changes her plan.')`).run();
    const status = await firstService.status('user-1', 'plot-1');
    expect(status).toMatchObject({ ok: true, value: { status: 'stale', current: false } });

    const secondAi = fakeImageAi();
    const regenerated = await new D1CharacterPortraitService(db, bucket, secondAi.value).generate('user-1', 'plot-1');
    expect(regenerated).toMatchObject({ ok: true, value: { status: 'ready', current: true } });
    expect(secondAi.referenceCounts()).toEqual([1]);
  });

  it('marks the portrait stale immediately when the current canonical branch consequence changes', async () => {
    const firstAi = fakeImageAi();
    const service = new D1CharacterPortraitService(db, bucket, firstAi.value);
    expect((await service.generate('user-1', 'plot-1')).ok).toBe(true);

    await db.prepare(
      `INSERT INTO episode_choices
         (id, episode_id, position, label, choice_key, intent, consequence)
       VALUES ('choice-1', 'episode-1', 1, 'Follow the caller alone', 'A', 'take the risk personally', 'Mina enters alone and loses contact with her ally.')`,
    ).run();
    await db.prepare(
      `INSERT INTO choice_commits
         (id, plot_id, episode_id, choice_id, sequence, choice_key, intent, consequence)
       VALUES ('commit-1', 'plot-1', 'episode-1', 'choice-1', 1, 'A', 'take the risk personally', 'Mina enters alone and loses contact with her ally.')`,
    ).run();

    expect(await service.status('user-1', 'plot-1')).toMatchObject({ ok: true, value: { status: 'stale', current: false } });
    const secondAi = fakeImageAi();
    expect((await new D1CharacterPortraitService(db, bucket, secondAi.value).generate('user-1', 'plot-1')).ok).toBe(true);
    expect(secondAi.referenceCounts()).toEqual([1]);
  });

  it('converges concurrent generation for one story fingerprint to one provider call', async () => {
    const ai = fakeImageAi();
    const service = new D1CharacterPortraitService(db, bucket, ai.value);

    const [left, right] = await Promise.all([
      service.generate('user-1', 'plot-1'),
      service.generate('user-1', 'plot-1'),
    ]);

    expect(left.ok).toBe(true);
    expect(right.ok).toBe(true);
    expect(ai.calls()).toBe(1);
  });

  it('does not expose another user drama portrait', async () => {
    const service = new D1CharacterPortraitService(db, bucket, fakeImageAi().value);
    expect(await service.status('attacker', 'plot-1')).toMatchObject({ ok: false, error: { code: 'not_found' } });
    expect(await service.generate('attacker', 'plot-1')).toMatchObject({ ok: false, error: { code: 'not_found' } });
  });
});

function fakeImageAi() {
  let callCount = 0;
  const models: string[] = [];
  const references: number[] = [];
  const bytes = new Uint8Array(320).fill(7);
  bytes.set([0xff, 0xd8, 0xff, 0xe0], 0);
  const base64 = btoa(String.fromCharCode(...bytes));
  const value = {
    async run(model: string, input: { multipart?: { body?: unknown; contentType?: string } }) {
      callCount += 1;
      models.push(model);
      const body = input.multipart?.body;
      let multipartText = '';
      if (body instanceof ReadableStream) multipartText = await new Response(body).text();
      references.push(multipartText.includes('name="input_image_0"') ? 1 : 0);
      expect(input.multipart?.contentType).toMatch(/^multipart\/form-data; boundary=/u);
      return { image: base64 };
    },
  } as unknown as Ai;
  return { value, calls: () => callCount, models: () => models, referenceCounts: () => references };
}

async function seedDrama(): Promise<void> {
  await db.prepare(`INSERT INTO users (id) VALUES ('user-1')`).run();
  await db.prepare(`INSERT INTO plots (id, user_id, title, premise, mood, summary) VALUES ('plot-1', 'user-1', 'Mirror', 'Mina follows a mysterious caller through a rainy city.', 'mysterious', 'Mina is deciding whether to trust the caller.')`).run();
  await db.prepare(`INSERT INTO characters (id, plot_id, name, role, traits_json) VALUES ('character-1', 'plot-1', 'Mina', 'protagonist', '{"traits":"observant, determined","goal":"find the truth"}')`).run();
  await db.prepare(`INSERT INTO episodes (id, plot_id, episode_number, title, script_json, summary) VALUES ('episode-1', 'plot-1', 1, 'First Signal', '{"script":"signal"}', 'Mina receives a call that connects the mystery to someone she once trusted.')`).run();
}
