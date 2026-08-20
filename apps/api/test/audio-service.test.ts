import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import migrationOne from '../migrations/0001_initial.sql?raw';
import migrationTwo from '../migrations/0002_episode_publication.sql?raw';
import migrationThree from '../migrations/0003_choice_commit.sql?raw';
import migrationFour from '../migrations/0004_quota_ledger.sql?raw';
import migrationFive from '../migrations/0005_tts_audio.sql?raw';
import migrationSix from '../migrations/0006_revenuecat_entitlements.sql?raw';
import migrationTen from '../migrations/0010_referrals_portraits.sql?raw';
import type { AppEnv } from '../src/env';
import { D1AudioService } from '../src/audio/d1-audio-service';
import type { AudioJob, AudioQueue } from '../src/audio/contracts';
import { D1QuotaLedger } from '../src/quota/d1-quota-ledger';
import { applySqlMigration, resetStoryData } from './d1-test-utils';

const db = (env as unknown as AppEnv).DB;

beforeAll(async () => {
  await applySqlMigration(db, migrationOne);
  await applySqlMigration(db, migrationTwo);
  await applySqlMigration(db, migrationThree);
  await applySqlMigration(db, migrationFour);
  await applySqlMigration(db, migrationFive);
  await applySqlMigration(db, migrationSix);
  await applySqlMigration(db, migrationTen);
});

beforeEach(async () => {
  await resetStoryData(db);
  await seedEpisode('user-1', 'plot-1', 'episode-1');
});

describe('D1AudioService', () => {
  it('reserves voice quota before enqueue and replays queued work without another reservation', async () => {
    const queue = fakeQueue();
    const service = new D1AudioService(db, queue);
    const input = requestInput('voice-request-001');

    const first = await service.request(input);
    const second = await service.request(input);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.status).toBe('queued');
    expect(second.value.id).toBe(first.value.id);
    expect(queue.messages).toEqual([{ assetId: first.value.id }]);
    const usage = await new D1QuotaLedger(db).getDailyUsage('user-1', utcDay());
    expect(usage).toMatchObject({ voiceReserved: 1, voiceConsumed: 0 });
  });

  it('converges concurrent different request keys for one episode/voice and releases the loser reservation', async () => {
    const queue = fakeQueue();
    const service = new D1AudioService(db, queue);

    const [left, right] = await Promise.all([
      service.request(requestInput('voice-race-left')),
      service.request(requestInput('voice-race-right')),
    ]);

    expect(left.ok).toBe(true);
    expect(right.ok).toBe(true);
    if (!left.ok || !right.ok) return;
    expect(left.value.id).toBe(right.value.id);
    expect(queue.messages).toHaveLength(1);
    const usage = await new D1QuotaLedger(db).getDailyUsage('user-1', utcDay());
    expect(usage).toMatchObject({ voiceReserved: 1, voiceConsumed: 0 });
    const reservations = await db
      .prepare("SELECT COUNT(*) AS count FROM quota_reservations WHERE user_id = ?")
      .bind('user-1')
      .first<{ count: number }>();
    expect(reservations?.count).toBe(1);
  });

  it('enforces the Free fresh-voice limit before a second scene is queued', async () => {
    await db
      .prepare('INSERT INTO episodes (id, plot_id, episode_number, title, script_json) VALUES (?, ?, ?, ?, ?)')
      .bind('episode-2', 'plot-1', 2, 'Second', JSON.stringify({ script: 'Second episode.' }))
      .run();
    const queue = fakeQueue();
    const service = new D1AudioService(db, queue);

    const first = await service.request(requestInput('voice-limit-001'));
    const second = await service.request({ ...requestInput('voice-limit-002'), sceneId: 'episode-2' });

    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: false, error: { code: 'quota_exceeded', limit: 1 } });
    expect(queue.messages).toHaveLength(1);
  });

  it('releases quota and marks the asset failed when enqueue itself fails', async () => {
    const queue: AudioQueue = {
      async send() {
        throw new Error('queue unavailable');
      },
    };
    const service = new D1AudioService(db, queue);

    const result = await service.request(requestInput('voice-queue-fail'));

    expect(result).toEqual({ ok: false, error: { code: 'queue_unavailable', message: 'Voice generation could not be queued.' } });
    const asset = await db.prepare('SELECT status, failure_code FROM audio_assets').first<{ status: string; failure_code: string }>();
    expect(asset).toEqual({ status: 'failed', failure_code: 'queue_unavailable' });
    const usage = await new D1QuotaLedger(db).getDailyUsage('user-1', utcDay());
    expect(usage).toMatchObject({ voiceReserved: 0, voiceConsumed: 0 });
  });

  it('allows a failed asset to be re-queued with a new quota reservation key', async () => {
    const failingQueue: AudioQueue = { async send() { throw new Error('down'); } };
    const firstService = new D1AudioService(db, failingQueue);
    await firstService.request(requestInput('voice-retry-old'));

    const queue = fakeQueue();
    const service = new D1AudioService(db, queue);
    const retried = await service.request(requestInput('voice-retry-new'));

    expect(retried.ok).toBe(true);
    if (!retried.ok) return;
    expect(retried.value).toMatchObject({ status: 'queued', sceneId: 'episode-1', kind: 'voice' });
    expect(queue.messages).toEqual([{ assetId: retried.value.id }]);
  });

  it('does not reveal another user episode or audio asset', async () => {
    const queue = fakeQueue();
    const service = new D1AudioService(db, queue);
    const created = await service.request(requestInput('voice-owner-001'));
    if (!created.ok) throw new Error('Failed to seed asset.');

    const wrongRequest = await service.request({ ...requestInput('voice-attacker'), userId: 'attacker' });
    const wrongRead = await service.getOwnedMediaAsset('attacker', created.value.id);

    expect(wrongRequest).toEqual({ ok: false, error: { code: 'not_found', message: 'Scene not found.' } });
    expect(wrongRead).toBeNull();
  });
});

function fakeQueue(): AudioQueue & { messages: AudioJob[] } {
  const messages: AudioJob[] = [];
  return {
    messages,
    async send(message) {
      messages.push(message);
    },
  };
}

function requestInput(reservationKey: string) {
  return {
    userId: 'user-1',
    sceneId: 'episode-1',
    voiceVariant: 'vi-narrator-female',
    reservationKey,
  };
}

async function seedEpisode(userId: string, plotId: string, episodeId: string): Promise<void> {
  await db.prepare('INSERT INTO users (id) VALUES (?)').bind(userId).run();
  await db
    .prepare('INSERT INTO plots (id, user_id, title, premise) VALUES (?, ?, ?, ?)')
    .bind(plotId, userId, 'Voice test', 'A plot used to test asynchronous speech generation.')
    .run();
  await db
    .prepare('INSERT INTO episodes (id, plot_id, episode_number, title, script_json) VALUES (?, ?, ?, ?, ?)')
    .bind(episodeId, plotId, 1, 'Episode one', JSON.stringify({ script: 'Linh mở cánh cửa và nghe tiếng mưa ngoài hành lang.' }))
    .run();
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}
