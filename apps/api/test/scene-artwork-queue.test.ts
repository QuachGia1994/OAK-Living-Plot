import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import migrationOne from '../migrations/0001_initial.sql?raw';
import migrationTwo from '../migrations/0002_episode_publication.sql?raw';
import migrationThree from '../migrations/0003_choice_commit.sql?raw';
import migrationSeven from '../migrations/0007_live_story_integration.sql?raw';
import migrationTwelve from '../migrations/0012_scene_artworks.sql?raw';
import type { MediaJob } from '../src/audio/contracts';
import { handleAudioQueue } from '../src/audio/queue-handler';
import type { AppEnv } from '../src/env';
import type { SpeechSynthesizer } from '../src/tts/contracts';
import { applySqlMigration, resetStoryData } from './d1-test-utils';

const runtimeEnv = env as unknown as AppEnv;
const db = runtimeEnv.DB;
const silentSynthesizer: SpeechSynthesizer = {
  async synthesize() {
    return { ok: false, error: { code: 'provider_error', message: 'unused', retryable: false } };
  },
};

beforeAll(async () => {
  for (const migration of [migrationOne, migrationTwo, migrationThree, migrationSeven, migrationTwelve]) {
    await applySqlMigration(db, migration);
  }
});

beforeEach(async () => {
  await resetStoryData(db);
  const listed = await runtimeEnv.AUDIO_BUCKET.list({ prefix: 'scene-artworks/' });
  await Promise.all(listed.objects.map((object) => runtimeEnv.AUDIO_BUCKET.delete(object.key)));
  await seedScene();
});

describe('Scene artwork queue dispatch', () => {
  it('renders and acknowledges an artwork job without entering the voice processor', async () => {
    const controls = queueMessage(1);
    await handleAudioQueue(
      batch('living-plot-media-test', controls.message),
      { ...runtimeEnv, AI: imageAi(false) },
      { synthesizer: silentSynthesizer },
    );

    expect(controls.acks()).toBe(1);
    expect(controls.retries()).toEqual([]);
    expect(await db.prepare("SELECT status, attempts FROM scene_artworks WHERE scene_id = 'scene-queue'").first()).toEqual({
      status: 'ready',
      attempts: 1,
    });
  });

  it('retries transient provider failure with bounded backoff', async () => {
    const controls = queueMessage(2);
    await handleAudioQueue(
      batch('living-plot-media-test', controls.message),
      { ...runtimeEnv, AI: imageAi(true) },
      { synthesizer: silentSynthesizer },
    );

    expect(controls.acks()).toBe(0);
    expect(controls.retries()).toEqual([{ delaySeconds: 60 }]);
    expect(await db.prepare("SELECT status, failure_code FROM scene_artworks WHERE scene_id = 'scene-queue'").first()).toEqual({
      status: 'failed',
      failure_code: 'provider_unavailable',
    });
  });
});

function queueMessage(attempts: number) {
  let ackCount = 0;
  const retryOptions: Array<{ delaySeconds?: number }> = [];
  const message = {
    id: `message-${attempts}`,
    timestamp: new Date(),
    attempts,
    body: { kind: 'scene_artwork', userId: 'user-queue', sceneId: 'scene-queue' } satisfies MediaJob,
    ack() { ackCount += 1; },
    retry(options?: { delaySeconds?: number }) { retryOptions.push(options ?? {}); },
  };
  return {
    message,
    acks: () => ackCount,
    retries: () => retryOptions,
  };
}

function batch(queue: string, message: ReturnType<typeof queueMessage>['message']): MessageBatch<MediaJob> {
  return { queue, messages: [message] } as unknown as MessageBatch<MediaJob>;
}

function imageAi(fail: boolean): Ai {
  const bytes = new Uint8Array(384).fill(3);
  bytes.set([0xff, 0xd8, 0xff, 0xe0], 0);
  const image = btoa(String.fromCharCode(...bytes));
  return {
    async run() {
      if (fail) throw new Error('provider unavailable');
      return { image };
    },
  } as unknown as Ai;
}

async function seedScene(): Promise<void> {
  await db.prepare("INSERT INTO users (id) VALUES ('user-queue')").run();
  await db.prepare(
    `INSERT INTO plots (id, user_id, title, premise, mood, summary)
     VALUES ('plot-queue', 'user-queue', 'Queue Story', 'A lighthouse answers Mina.', 'mysterious', 'Mina hears the answer.')`,
  ).run();
  await db.prepare(
    `INSERT INTO characters (id, plot_id, name, role, traits_json)
     VALUES ('character-queue', 'plot-queue', 'Mina', 'protagonist', '{}')`,
  ).run();
  await db.prepare(
    `INSERT INTO episodes (id, plot_id, episode_number, title, script_json, summary)
     VALUES ('scene-queue', 'plot-queue', 1, 'The Answer', '{"script":"The lighthouse answers through green fire."}', 'The lighthouse answers Mina through green fire.')`,
  ).run();
}
