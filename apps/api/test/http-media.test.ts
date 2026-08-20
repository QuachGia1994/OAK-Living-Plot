import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import migrationOne from '../migrations/0001_initial.sql?raw';
import migrationFour from '../migrations/0004_quota_ledger.sql?raw';
import migrationFive from '../migrations/0005_tts_audio.sql?raw';
import migrationSix from '../migrations/0006_revenuecat_entitlements.sql?raw';
import migrationTen from '../migrations/0010_referrals_portraits.sql?raw';
import { AudioProcessor } from '../src/audio/audio-processor';
import type { AudioJob, AudioQueue } from '../src/audio/contracts';
import type { SessionVerifier } from '../src/auth/session-verifier';
import type { AppEnv } from '../src/env';
import { handleRequest } from '../src/http/app';
import { D1UserRepository } from '../src/persistence/d1-user-repository';
import type { ProductEventTelemetry, ProductTelemetrySink } from '../src/telemetry/product-events';
import type { SpeechSynthesizer } from '../src/tts/contracts';
import { applySqlMigration, resetStoryData } from './d1-test-utils';

const runtimeEnv = env as unknown as AppEnv;
const db = runtimeEnv.DB;
const testEnv: AppEnv = {
  ...runtimeEnv,
  CLERK_JWT_KEY: 'unused',
  CLERK_AUTHORIZED_PARTIES: 'https://living-plot.test',
  GEMINI_API_KEY: 'unused',
  REVENUECAT_SECRET_API_KEY: 'unused',
  REVENUECAT_PLUS_ENTITLEMENT_ID: 'plus',
  REVENUECAT_WEBHOOK_AUTHORIZATION: 'Bearer unused',
  REVENUECAT_WEBHOOK_SIGNING_SECRET: 'unused',
};

beforeAll(async () => {
  await applySqlMigration(db, migrationOne);
  await applySqlMigration(db, migrationFour);
  await applySqlMigration(db, migrationFive);
  await applySqlMigration(db, migrationSix);
  await applySqlMigration(db, migrationTen);
});

beforeEach(async () => {
  await resetStoryData(db);
  const listed = await runtimeEnv.AUDIO_BUCKET.list();
  await Promise.all(listed.objects.map((object) => runtimeEnv.AUDIO_BUCKET.delete(object.key)));
});

describe('media HTTP boundary', () => {
  it('queues owned scene voice as a provider-neutral MediaAsset', async () => {
    await seedOwnerWithScenes(1);
    const queue = fakeQueue();
    const response = await handleRequest(postVoice('scene-1', 'voice-http-001'), testEnv, {
      sessionVerifier: verifier('clerk-owner'),
      audioQueue: queue,
    });

    expect(response.status).toBe(202);
    const body = (await response.json()) as { media: Record<string, unknown> };
    expect(body.media).toMatchObject({ sceneId: 'scene-1', kind: 'voice', variant: 'vi-narrator-female', status: 'queued', attempts: 0, cached: false });
    expect(body.media).not.toHaveProperty('objectKey');
    expect(body.media).not.toHaveProperty('provider');
    expect(body.media).not.toHaveProperty('providerVoiceId');
    expect(body.media).not.toHaveProperty('reservationKey');
    expect(queue.messages).toEqual([{ assetId: body.media.id }]);
  });

  it('normalizes persistence-only staged media to product processing state', async () => {
    await seedOwnerWithScenes(1);
    const queue = fakeQueue();
    const requested = await handleRequest(postVoice('scene-1', 'voice-http-stage'), testEnv, {
      sessionVerifier: verifier('clerk-owner'),
      audioQueue: queue,
    });
    const requestedBody = (await requested.json()) as { media: { id: string } };
    await db.prepare("UPDATE audio_assets SET status = 'staged', object_key = ? WHERE id = ?")
      .bind('audio/scene-1/vi-narrator-female.mp3', requestedBody.media.id)
      .run();

    const status = await handleRequest(getMediaStatus(requestedBody.media.id), testEnv, {
      sessionVerifier: verifier('clerk-owner'),
    });

    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({
      media: expect.objectContaining({ id: requestedBody.media.id, sceneId: 'scene-1', status: 'processing' }),
    });
  });

  it('records one fresh voice product event and does not double-count an idempotent replay', async () => {
    await seedOwnerWithScenes(1);
    const queue = fakeQueue();
    const events: ProductEventTelemetry[] = [];
    const productTelemetry: ProductTelemetrySink = { recordProductEvent(event) { events.push(structuredClone(event)); } };

    const first = await handleRequest(postVoice('scene-1', 'voice-http-event-1'), testEnv, { sessionVerifier: verifier('clerk-owner'), audioQueue: queue, productTelemetry });
    const replay = await handleRequest(postVoice('scene-1', 'voice-http-event-2'), testEnv, { sessionVerifier: verifier('clerk-owner'), audioQueue: queue, productTelemetry });

    expect(first.status).toBe(202);
    expect(replay.status).toBe(202);
    expect(events).toEqual([{ event: 'voice_requested', tier: 'free' }]);
    expect(queue.messages).toHaveLength(1);
  });

  it('does not reveal another user scene or media asset', async () => {
    await seedOwnerWithScenes(1);
    const queue = fakeQueue();
    const ownerRequest = await handleRequest(postVoice('scene-1', 'voice-http-owner'), testEnv, { sessionVerifier: verifier('clerk-owner'), audioQueue: queue });
    const ownerBody = (await ownerRequest.json()) as { media: { id: string } };

    const attackerRequest = await handleRequest(postVoice('scene-1', 'voice-http-attacker'), testEnv, { sessionVerifier: verifier('clerk-attacker'), audioQueue: queue });
    const attackerRead = await handleRequest(getMedia(ownerBody.media.id), testEnv, { sessionVerifier: verifier('clerk-attacker') });

    expect(attackerRequest.status).toBe(404);
    expect(attackerRead.status).toBe(404);
  });

  it('enforces server-side Free voice quota before a second scene is queued', async () => {
    await seedOwnerWithScenes(2);
    const queue = fakeQueue();

    const first = await handleRequest(postVoice('scene-1', 'voice-http-limit-1'), testEnv, { sessionVerifier: verifier('clerk-owner'), audioQueue: queue });
    const second = await handleRequest(postVoice('scene-2', 'voice-http-limit-2'), testEnv, { sessionVerifier: verifier('clerk-owner'), audioQueue: queue });

    expect(first.status).toBe(202);
    expect(second.status).toBe(429);
    expect(await second.json()).toMatchObject({ error: 'quota_exceeded', limit: 1 });
    expect(queue.messages).toHaveLength(1);
  });

  it('keeps fresh cloud narration unblocked in the development preview environment', async () => {
    await seedOwnerWithScenes(2);
    const queue = fakeQueue();
    const previewEnv: AppEnv = { ...testEnv, QUOTA_MODE: 'preview_unlimited' };

    const first = await handleRequest(postVoice('scene-1', 'voice-http-preview-1'), previewEnv, { sessionVerifier: verifier('clerk-owner'), audioQueue: queue });
    const second = await handleRequest(postVoice('scene-2', 'voice-http-preview-2'), previewEnv, { sessionVerifier: verifier('clerk-owner'), audioQueue: queue });

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(queue.messages).toHaveLength(2);
  });

  it('uses backend-materialized Plus entitlement instead of trusting client input', async () => {
    const owner = await seedOwnerWithScenes(2);
    await db.prepare(
      `INSERT INTO user_entitlements (user_id, tier, plus_expires_at, provider_request_date_ms, synced_at)
       VALUES (?, 'plus', ?, ?, ?)`,
    ).bind(owner.id, Date.now() + 86_400_000, Date.now(), Date.now()).run();
    const queue = fakeQueue();

    const first = await handleRequest(postVoice('scene-1', 'voice-http-plus-1'), testEnv, { sessionVerifier: verifier('clerk-owner'), audioQueue: queue });
    const second = await handleRequest(postVoice('scene-2', 'voice-http-plus-2'), testEnv, { sessionVerifier: verifier('clerk-owner'), audioQueue: queue });

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(queue.messages).toHaveLength(2);
  });

  it('streams ready private media only after owner authorization', async () => {
    await seedOwnerWithScenes(1);
    const queue = fakeQueue();
    const requested = await handleRequest(postVoice('scene-1', 'voice-http-ready'), testEnv, { sessionVerifier: verifier('clerk-owner'), audioQueue: queue });
    const requestedBody = (await requested.json()) as { media: { id: string } };
    await new AudioProcessor(db, runtimeEnv.AUDIO_BUCKET, successSynthesizer()).process({ assetId: requestedBody.media.id });

    const ownerRead = await handleRequest(getMedia(requestedBody.media.id), testEnv, { sessionVerifier: verifier('clerk-owner') });
    const attackerRead = await handleRequest(getMedia(requestedBody.media.id), testEnv, { sessionVerifier: verifier('clerk-attacker') });

    expect(ownerRead.status).toBe(200);
    expect(ownerRead.headers.get('Content-Type')).toBe('audio/mpeg');
    expect(ownerRead.headers.get('Cache-Control')).toBe('private, max-age=3600');
    expect(new TextDecoder().decode(await ownerRead.arrayBuffer())).toBe('http-audio');
    expect(attackerRead.status).toBe(404);
  });

  it('returns product media state instead of a public URL while processing is incomplete', async () => {
    await seedOwnerWithScenes(1);
    const queue = fakeQueue();
    const requested = await handleRequest(postVoice('scene-1', 'voice-http-pending'), testEnv, { sessionVerifier: verifier('clerk-owner'), audioQueue: queue });
    const requestedBody = (await requested.json()) as { media: { id: string } };

    const read = await handleRequest(getMedia(requestedBody.media.id), testEnv, { sessionVerifier: verifier('clerk-owner') });
    expect(read.status).toBe(202);
    const body = (await read.json()) as { media: Record<string, unknown> };
    expect(body.media).toMatchObject({ id: requestedBody.media.id, sceneId: 'scene-1', status: 'queued' });
    expect(body.media).not.toHaveProperty('objectKey');
  });
});

async function seedOwnerWithScenes(count: number) {
  const users = new D1UserRepository(db);
  const owner = await users.resolveOrCreate('clerk-owner');
  await db.prepare('INSERT INTO plots (id, user_id, title, premise) VALUES (?, ?, ?, ?)')
    .bind('plot-owner', owner.id, 'HTTP voice', 'An owner-scoped drama for media HTTP tests.')
    .run();
  for (let index = 1; index <= count; index += 1) {
    await db.prepare('INSERT INTO episodes (id, plot_id, episode_number, title, script_json) VALUES (?, ?, ?, ?, ?)')
      .bind(`scene-${index}`, 'plot-owner', index, `Scene ${index}`, JSON.stringify({ script: `Scene ${index} voice text.` }))
      .run();
  }
  return owner;
}

function verifier(subject: string): SessionVerifier {
  return { async authenticate() { return { subject }; } };
}

function fakeQueue(): AudioQueue & { messages: AudioJob[] } {
  const messages: AudioJob[] = [];
  return { messages, async send(message) { messages.push(message); } };
}

function successSynthesizer(): SpeechSynthesizer {
  return {
    async synthesize() {
      return {
        ok: true,
        value: {
          bytes: new TextEncoder().encode('http-audio'),
          contentType: 'audio/mpeg',
          inputCharacters: 21,
        },
      };
    },
  };
}

function postVoice(sceneId: string, reservationKey: string): Request {
  return new Request(`https://living-plot.test/v1/scenes/${sceneId}/voice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voiceVariant: 'vi-narrator-female', reservationKey }),
  });
}

function getMedia(assetId: string): Request {
  return new Request(`https://living-plot.test/v1/media/${assetId}`);
}

function getMediaStatus(assetId: string): Request {
  return new Request(`https://living-plot.test/v1/media/${assetId}/status`);
}
