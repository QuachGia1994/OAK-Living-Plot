import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import migrationSql from '../migrations/0001_initial.sql?raw';
import type { SessionVerifier } from '../src/auth/session-verifier';
import type { AppEnv } from '../src/env';
import { handleRequest } from '../src/http/app';
import { applySqlMigration, resetStoryData } from './d1-test-utils';

const runtimeEnv = env as unknown as AppEnv;
const db = runtimeEnv.DB;
const testEnv: AppEnv = {
  DB: db,
  TTS_QUEUE: runtimeEnv.TTS_QUEUE,
  TTS_DLQ_NAME: 'living-plot-tts-dlq-test',
  AUDIO_BUCKET: runtimeEnv.AUDIO_BUCKET,
  ANALYTICS: runtimeEnv.ANALYTICS,
  CLERK_PUBLISHABLE_KEY: 'unused-in-injected-tests',
  CLERK_JWT_KEY: 'unused-in-injected-tests',
  CLERK_AUTHORIZED_PARTIES: 'https://living-plot.test',
  GEMINI_API_KEY: 'unused-in-auth-tests',
  REVENUECAT_SECRET_API_KEY: 'unused-in-auth-tests',
  REVENUECAT_PLUS_ENTITLEMENT_ID: 'plus',
  REVENUECAT_WEBHOOK_AUTHORIZATION: 'Bearer unused-in-auth-tests',
  REVENUECAT_WEBHOOK_SIGNING_SECRET: 'unused-in-auth-tests',
};

beforeEach(async () => {
  await applySqlMigration(db, migrationSql);
  await resetStoryData(db);
});

describe('protected HTTP boundary', () => {
  it('rejects an unauthenticated request', async () => {
    const response = await handleRequest(request('/v1/me'), testEnv, {
      sessionVerifier: verifier(null),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });

  it('rejects declared oversized protected request bodies before authentication work', async () => {
    const response = await handleRequest(new Request('https://living-plot.test/v1/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': '20000' },
      body: '{}',
    }), testEnv, {
      sessionVerifier: verifier('clerk-owner'),
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'payload_too_large' });
  });

  it('maps the authenticated subject to an internal user', async () => {
    const response = await handleRequest(request('/v1/me'), testEnv, {
      sessionVerifier: verifier('clerk-owner'),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { user: { id: string } };
    const row = await db
      .prepare('SELECT id, auth_subject FROM users WHERE auth_subject = ?')
      .bind('clerk-owner')
      .first<{ id: string; auth_subject: string }>();
    expect(body.user.id).toBe(row?.id);
  });

  it('does not expose the removed legacy plot-read route', async () => {
    const response = await handleRequest(request('/v1/plots/plot-owner'), testEnv, {
      sessionVerifier: verifier('clerk-owner'),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('fails closed when the authentication verifier is unavailable', async () => {
    const response = await handleRequest(request('/v1/me'), testEnv, {
      sessionVerifier: {
        async authenticate() {
          throw new Error('provider failure');
        },
      },
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'auth_unavailable' });
  });

  it('fails closed when Clerk runtime configuration is missing', async () => {
    const response = await handleRequest(request('/v1/me'), {
      ...testEnv,
      CLERK_PUBLISHABLE_KEY: '',
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'auth_unavailable' });
  });
});

function verifier(subject: string | null): SessionVerifier {
  return {
    async authenticate() {
      return subject ? { subject } : null;
    },
  };
}

function request(path: string, headers?: HeadersInit): Request {
  return new Request(`https://living-plot.test${path}`, { headers });
}

