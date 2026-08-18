import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import migrationOne from '../migrations/0001_initial.sql?raw';
import migrationTwo from '../migrations/0002_episode_publication.sql?raw';
import migrationThree from '../migrations/0003_choice_commit.sql?raw';
import migrationFour from '../migrations/0004_quota_ledger.sql?raw';
import migrationFive from '../migrations/0005_tts_audio.sql?raw';
import { AudioProcessor } from '../src/audio/audio-processor';
import { D1AudioService } from '../src/audio/d1-audio-service';
import type { AudioJob, AudioQueue } from '../src/audio/contracts';
import type { AppEnv } from '../src/env';
import { D1QuotaLedger } from '../src/quota/d1-quota-ledger';
import type { SpeechResult, SpeechSynthesizer } from '../src/tts/contracts';
import { applySqlMigration, resetStoryData } from './d1-test-utils';

const appEnv = env as unknown as AppEnv;
const db = appEnv.DB;
const bucket = appEnv.AUDIO_BUCKET;

beforeAll(async () => {
  await applySqlMigration(db, migrationOne);
  await applySqlMigration(db, migrationTwo);
  await applySqlMigration(db, migrationThree);
  await applySqlMigration(db, migrationFour);
  await applySqlMigration(db, migrationFive);
});

beforeEach(async () => {
  await resetStoryData(db);
  const listed = await bucket.list();
  await Promise.all(listed.objects.map((object) => bucket.delete(object.key)));
  await seedEpisode();
});

describe('AudioProcessor', () => {
  it('synthesizes once, stores private MP3 in R2, consumes quota, and converges retries on ready', async () => {
    const queued = fakeQueue();
    const service = new D1AudioService(db, queued);
    const requested = await service.request(requestInput('processor-success'));
    if (!requested.ok) throw new Error('Failed to seed audio request.');
    const synthesizer = recordingSynthesizer(successSpeech());
    const processor = new AudioProcessor(db, bucket, synthesizer);

    const first = await processor.process({ assetId: requested.value.id });
    const second = await processor.process({ assetId: requested.value.id });

    expect(first.action).toBe('ack');
    expect(second.action).toBe('ack');
    expect(synthesizer.calls).toBe(1);
    const delivery = await service.getOwnedDeliveryAsset('user-1', requested.value.id);
    expect(delivery?.media).toMatchObject({ status: 'ready', attempts: 1, cached: true, sceneId: 'episode-1' });
    expect(delivery?.objectKey).toBe(`audio/episode-1/vi-narrator-female.mp3`);
    const object = await bucket.get(delivery?.objectKey ?? 'missing');
    expect(object).not.toBeNull();
    expect(object?.httpMetadata?.contentType).toBe('audio/mpeg');
    expect(new TextDecoder().decode(await object?.arrayBuffer())).toBe('synthetic-mp3');
    const usage = await new D1QuotaLedger(db).getDailyUsage('user-1', utcDay());
    expect(usage).toMatchObject({ voiceConsumed: 1, voiceReserved: 0 });
  });

  it('keeps quota reserved and asks Queue to retry a retryable provider failure', async () => {
    const requested = await createRequested('processor-retry');
    const synthesizer = recordingSynthesizer({
      ok: false,
      error: { code: 'provider_error', message: 'rate limited', retryable: true, status: 429 },
    });
    const processor = new AudioProcessor(db, bucket, synthesizer);

    const result = await processor.process({ assetId: requested.id });

    expect(result).toEqual({ action: 'retry', assetId: requested.id, delaySeconds: 30 });
    const asset = await loadAsset(requested.id);
    expect(asset).toMatchObject({ status: 'queued', failure_code: 'provider_error', attempts: 1 });
    const usage = await new D1QuotaLedger(db).getDailyUsage('user-1', utcDay());
    expect(usage).toMatchObject({ voiceReserved: 1, voiceConsumed: 0 });
  });

  it('marks a non-retryable provider failure terminal and releases quota', async () => {
    const requested = await createRequested('processor-terminal');
    const synthesizer = recordingSynthesizer({
      ok: false,
      error: { code: 'provider_error', message: 'invalid voice', retryable: false, status: 400 },
    });
    const processor = new AudioProcessor(db, bucket, synthesizer);

    const result = await processor.process({ assetId: requested.id });

    expect(result.action).toBe('ack');
    expect(await loadAsset(requested.id)).toMatchObject({ status: 'failed', failure_code: 'provider_error' });
    const usage = await new D1QuotaLedger(db).getDailyUsage('user-1', utcDay());
    expect(usage).toMatchObject({ voiceReserved: 0, voiceConsumed: 0 });
  });

  it('finalizes a staged R2 object without invoking TTS again', async () => {
    const requested = await createRequested('processor-staged');
    const objectKey = 'audio/episode-1/vi-narrator-female.mp3';
    await bucket.put(objectKey, new TextEncoder().encode('already-generated'), {
      httpMetadata: { contentType: 'audio/mpeg' },
    });
    await db
      .prepare("UPDATE audio_assets SET status = 'staged', object_key = ?, input_characters = 42 WHERE id = ?")
      .bind(objectKey, requested.id)
      .run();
    const synthesizer = recordingSynthesizer(successSpeech());
    const processor = new AudioProcessor(db, bucket, synthesizer);

    const result = await processor.process({ assetId: requested.id });

    expect(result.action).toBe('ack');
    expect(synthesizer.calls).toBe(0);
    expect(await loadAsset(requested.id)).toMatchObject({ status: 'ready', input_characters: 42 });
    const usage = await new D1QuotaLedger(db).getDailyUsage('user-1', utcDay());
    expect(usage).toMatchObject({ voiceConsumed: 1, voiceReserved: 0 });
  });

  it('keeps staged metadata and retries when private R2 cleanup fails', async () => {
    const requested = await createRequested('processor-cleanup-fail');
    const objectKey = 'audio/episode-1/vi-narrator-female.mp3';
    await bucket.put(objectKey, new TextEncoder().encode('private-object'), {
      httpMetadata: { contentType: 'audio/mpeg' },
    });
    await db
      .prepare("UPDATE audio_assets SET status = 'staged', object_key = ?, input_characters = 42 WHERE id = ?")
      .bind(objectKey, requested.id)
      .run();
    const failingBucket = {
      async delete() { throw new Error('r2 unavailable'); },
    } as unknown as R2Bucket;
    const missingQuota = {
      async consume() { return { ok: false as const, error: { code: 'not_found' as const, message: 'reservation missing' } }; },
    } as unknown as D1QuotaLedger;
    const processor = new AudioProcessor(db, failingBucket, recordingSynthesizer(successSpeech()), missingQuota);

    const result = await processor.process({ assetId: requested.id });

    expect(result).toEqual({ action: 'retry', assetId: requested.id, delaySeconds: 30 });
    const asset = await db
      .prepare('SELECT status, object_key, failure_code FROM audio_assets WHERE id = ?')
      .bind(requested.id)
      .first<{ status: string; object_key: string | null; failure_code: string | null }>();
    expect(asset).toEqual({ status: 'staged', object_key: objectKey, failure_code: 'r2_cleanup_failed' });
  });

  it('DLQ cleanup releases held quota and marks unfinished work failed', async () => {
    const requested = await createRequested('processor-dlq');
    const processor = new AudioProcessor(db, bucket, recordingSynthesizer(successSpeech()));

    const result = await processor.failDeadLetter({ assetId: requested.id });

    expect(result.action).toBe('ack');
    expect(await loadAsset(requested.id)).toMatchObject({ status: 'failed', failure_code: 'retry_exhausted' });
    const usage = await new D1QuotaLedger(db).getDailyUsage('user-1', utcDay());
    expect(usage).toMatchObject({ voiceReserved: 0, voiceConsumed: 0 });
  });
});

function recordingSynthesizer(result: SpeechResult): SpeechSynthesizer & { calls: number } {
  return {
    calls: 0,
    async synthesize() {
      this.calls += 1;
      return result;
    },
  };
}

function successSpeech(): SpeechResult {
  return {
    ok: true,
    value: {
      bytes: new TextEncoder().encode('synthetic-mp3'),
      contentType: 'audio/mpeg',
      inputCharacters: 56,
    },
  };
}

async function createRequested(reservationKey: string) {
  const queue = fakeQueue();
  const service = new D1AudioService(db, queue);
  const result = await service.request(requestInput(reservationKey));
  if (!result.ok) throw new Error('Failed to create requested audio asset.');
  return result.value;
}

function fakeQueue(): AudioQueue & { messages: AudioJob[] } {
  const messages: AudioJob[] = [];
  return { messages, async send(message) { messages.push(message); } };
}

function requestInput(reservationKey: string) {
  return {
    userId: 'user-1',
    sceneId: 'episode-1',
    voiceVariant: 'vi-narrator-female',
    reservationKey,
    tier: 'free' as const,
  };
}

async function seedEpisode(): Promise<void> {
  await db.prepare('INSERT INTO users (id) VALUES (?)').bind('user-1').run();
  await db
    .prepare('INSERT INTO plots (id, user_id, title, premise) VALUES (?, ?, ?, ?)')
    .bind('plot-1', 'user-1', 'Voice processor', 'A plot used to verify the queue consumer.')
    .run();
  await db
    .prepare('INSERT INTO episodes (id, plot_id, episode_number, title, script_json) VALUES (?, ?, ?, ?, ?)')
    .bind('episode-1', 'plot-1', 1, 'Rain', JSON.stringify({ script: 'Linh mở cánh cửa và nghe tiếng mưa ngoài hành lang.' }))
    .run();
}

async function loadAsset(assetId: string) {
  return db
    .prepare('SELECT status, failure_code, attempts, input_characters FROM audio_assets WHERE id = ?')
    .bind(assetId)
    .first<{ status: string; failure_code: string | null; attempts: number; input_characters: number }>();
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}
