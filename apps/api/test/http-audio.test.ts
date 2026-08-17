import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import migrationOne from '../migrations/0001_initial.sql?raw';
import migrationFour from '../migrations/0004_quota_ledger.sql?raw';
import migrationFive from '../migrations/0005_tts_audio.sql?raw';
import migrationSix from '../migrations/0006_revenuecat_entitlements.sql?raw';
import { AudioProcessor } from '../src/audio/audio-processor';
import type { AudioJob, AudioQueue } from '../src/audio/contracts';
import type { SessionVerifier } from '../src/auth/session-verifier';
import type { AppEnv } from '../src/env';
import { handleRequest } from '../src/http/app';
import { D1UserRepository } from '../src/persistence/d1-user-repository';
import type { SpeechSynthesizer } from '../src/tts/contracts';
import { applySqlMigration, resetStoryData } from './d1-test-utils';

const runtimeEnv = env as unknown as AppEnv;
const db = runtimeEnv.DB;
const testEnv: AppEnv = {
  ...runtimeEnv,
  CLERK_PUBLISHABLE_KEY: 'unused',
  CLERK_JWT_KEY: 'unused',
  CLERK_AUTHORIZED_PARTIES: 'https://living-plot.test',
  GEMINI_API_KEY: 'unused',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: 'unused',
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: 'unused',
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
});

beforeEach(async () => {
  await resetStoryData(db);
  const listed = await runtimeEnv.AUDIO_BUCKET.list();
  await Promise.all(listed.objects.map((object) => runtimeEnv.AUDIO_BUCKET.delete(object.key)));
});

describe('audio HTTP boundary', () => {
  it('queues owned voice work and does not expose the R2 object key', async () => {
    const owner = await seedOwnerWithEpisodes(1);
    const queue = fakeQueue();

    const response = await handleRequest(
      postAudio('episode-1', 'voice-http-001'),
      testEnv,
      { sessionVerifier: verifier('clerk-owner'), audioQueue: queue },
    );

    expect(response.status).toBe(202);
    const body = (await response.json()) as { audio: Record<string, unknown> };
    expect(body.audio).toMatchObject({ episodeId: 'episode-1', voiceVariant: 'vi-narrator-female', status: 'queued' });
    expect(body.audio).not.toHaveProperty('objectKey');
    expect(body.audio).not.toHaveProperty('providerVoiceId');
    expect(queue.messages).toEqual([{ assetId: body.audio.id }]);
    expect(owner.id).toBeTruthy();
  });

  it('does not reveal another user episode', async () => {
    await seedOwnerWithEpisodes(1);
    const queue = fakeQueue();

    const response = await handleRequest(
      postAudio('episode-1', 'voice-http-attacker'),
      testEnv,
      { sessionVerifier: verifier('clerk-attacker'), audioQueue: queue },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
    expect(queue.messages).toHaveLength(0);
  });

  it('returns 429 before enqueue when the server-side Free voice limit is exhausted', async () => {
    await seedOwnerWithEpisodes(2);
    const queue = fakeQueue();

    const first = await handleRequest(postAudio('episode-1', 'voice-http-limit-1'), testEnv, {
      sessionVerifier: verifier('clerk-owner'),
      audioQueue: queue,
    });
    const second = await handleRequest(postAudio('episode-2', 'voice-http-limit-2'), testEnv, {
      sessionVerifier: verifier('clerk-owner'),
      audioQueue: queue,
    });

    expect(first.status).toBe(202);
    expect(second.status).toBe(429);
    const body = (await second.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ error: 'quota_exceeded', limit: 1 });
    expect(typeof body.resetAt).toBe('string');
    expect(queue.messages).toHaveLength(1);
  });

  it('uses backend-materialized Plus entitlement instead of trusting a client tier flag', async () => {
    const owner = await seedOwnerWithEpisodes(2);
    await db
      .prepare(
        `INSERT INTO user_entitlements
           (user_id, tier, plus_expires_at, provider_request_date_ms, synced_at)
         VALUES (?, 'plus', ?, ?, ?)`,
      )
      .bind(owner.id, Date.now() + 86_400_000, Date.now(), Date.now())
      .run();
    const queue = fakeQueue();

    const first = await handleRequest(postAudio('episode-1', 'voice-http-plus-1'), testEnv, {
      sessionVerifier: verifier('clerk-owner'),
      audioQueue: queue,
    });
    const second = await handleRequest(postAudio('episode-2', 'voice-http-plus-2'), testEnv, {
      sessionVerifier: verifier('clerk-owner'),
      audioQueue: queue,
    });

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(queue.messages).toHaveLength(2);
  });

  it('streams ready R2 audio only after authenticated owner lookup', async () => {
    await seedOwnerWithEpisodes(1);
    const queue = fakeQueue();
    const requested = await handleRequest(postAudio('episode-1', 'voice-http-ready'), testEnv, {
      sessionVerifier: verifier('clerk-owner'),
      audioQueue: queue,
    });
    const requestedBody = (await requested.json()) as { audio: { id: string } };
    const processor = new AudioProcessor(db, runtimeEnv.AUDIO_BUCKET, successSynthesizer());
    await processor.process({ assetId: requestedBody.audio.id });

    const ownerRead = await handleRequest(getAudio(requestedBody.audio.id), testEnv, {
      sessionVerifier: verifier('clerk-owner'),
    });
    const attackerRead = await handleRequest(getAudio(requestedBody.audio.id), testEnv, {
      sessionVerifier: verifier('clerk-attacker'),
    });

    expect(ownerRead.status).toBe(200);
    expect(ownerRead.headers.get('Content-Type')).toBe('audio/mpeg');
    expect(ownerRead.headers.get('Cache-Control')).toBe('private, max-age=3600');
    expect(new TextDecoder().decode(await ownerRead.arrayBuffer())).toBe('http-audio');
    expect(attackerRead.status).toBe(404);
  });

  it('exposes owner-scoped JSON status separately from the private binary stream', async () => {
    await seedOwnerWithEpisodes(1);
    const queue = fakeQueue();
    const requested = await handleRequest(postAudio('episode-1', 'voice-http-status'), testEnv, {
      sessionVerifier: verifier('clerk-owner'),
      audioQueue: queue,
    });
    const requestedBody = (await requested.json()) as { audio: { id: string } };

    const ownerStatus = await handleRequest(getAudioStatus(requestedBody.audio.id), testEnv, {
      sessionVerifier: verifier('clerk-owner'),
    });
    const attackerStatus = await handleRequest(getAudioStatus(requestedBody.audio.id), testEnv, {
      sessionVerifier: verifier('clerk-attacker'),
    });

    expect(ownerStatus.status).toBe(200);
    expect(await ownerStatus.json()).toEqual({
      audio: expect.objectContaining({ id: requestedBody.audio.id, episodeId: 'episode-1', status: 'queued' }),
    });
    expect(attackerStatus.status).toBe(404);
  });

  it('returns processing metadata rather than a public URL while audio is not ready', async () => {
    await seedOwnerWithEpisodes(1);
    const queue = fakeQueue();
    const requested = await handleRequest(postAudio('episode-1', 'voice-http-pending'), testEnv, {
      sessionVerifier: verifier('clerk-owner'),
      audioQueue: queue,
    });
    const requestedBody = (await requested.json()) as { audio: { id: string } };

    const read = await handleRequest(getAudio(requestedBody.audio.id), testEnv, {
      sessionVerifier: verifier('clerk-owner'),
    });

    expect(read.status).toBe(202);
    const body = (await read.json()) as { audio: Record<string, unknown> };
    expect(body.audio).toMatchObject({ id: requestedBody.audio.id, status: 'queued' });
    expect(body.audio).not.toHaveProperty('objectKey');
  });
});

async function seedOwnerWithEpisodes(count: number) {
  const users = new D1UserRepository(db);
  const owner = await users.resolveOrCreate('clerk-owner');
  await db
    .prepare('INSERT INTO plots (id, user_id, title, premise) VALUES (?, ?, ?, ?)')
    .bind('plot-owner', owner.id, 'HTTP voice', 'An owner-scoped plot for audio HTTP tests.')
    .run();
  for (let index = 1; index <= count; index += 1) {
    await db
      .prepare('INSERT INTO episodes (id, plot_id, episode_number, title, script_json) VALUES (?, ?, ?, ?, ?)')
      .bind(
        `episode-${index}`,
        'plot-owner',
        index,
        `Episode ${index}`,
        JSON.stringify({ script: `Episode ${index} audio text.` }),
      )
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

function postAudio(episodeId: string, reservationKey: string): Request {
  return new Request(`https://living-plot.test/v1/episodes/${episodeId}/audio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voiceVariant: 'vi-narrator-female', reservationKey }),
  });
}

function getAudio(assetId: string): Request {
  return new Request(`https://living-plot.test/v1/audio/${assetId}`);
}

function getAudioStatus(assetId: string): Request {
  return new Request(`https://living-plot.test/v1/audio/${assetId}/status`);
}
