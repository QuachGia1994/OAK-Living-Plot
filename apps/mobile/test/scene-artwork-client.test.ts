import { describe, expect, it } from 'vitest';
import { HttpSceneArtworkClient, SceneArtworkClientError } from '../src/features/artwork/scene-artwork-client';

const artwork = {
  status: 'ready' as const,
  current: true,
  attempts: 1,
  updatedAt: '2026-08-23T12:00:00.000Z',
  readyAt: '2026-08-23T12:00:00.000Z',
};

describe('HttpSceneArtworkClient', () => {
  it('loads status, requests an idempotent render, and delivers private bytes with fresh bearer tokens', async () => {
    let token = 0;
    const requests: string[] = [];
    const client = new HttpSceneArtworkClient('https://api.test', async () => `token-${++token}`, async (input, init) => {
      const url = String(input);
      requests.push(`${init?.method}:${url}:${new Headers(init?.headers).get('Authorization')}`);
      if (init?.method === 'GET' && url.endsWith('/artwork')) {
        return new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        });
      }
      return new Response(JSON.stringify({ artwork }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    expect(await client.status('scene-1')).toEqual(artwork);
    expect(await client.generate('scene-1')).toEqual(artwork);
    expect(await client.source('scene-1')).toEqual({ uri: 'data:image/jpeg;base64,/9j/' });
    expect(requests).toEqual([
      'GET:https://api.test/v1/scenes/scene-1/artwork/status:Bearer token-1',
      'POST:https://api.test/v1/scenes/scene-1/artwork:Bearer token-2',
      'GET:https://api.test/v1/scenes/scene-1/artwork:Bearer token-3',
    ]);
  });

  it('reconciles a lost POST response so completed artwork is not reported as failed', async () => {
    const requests: string[] = [];
    const client = new HttpSceneArtworkClient('https://api.test', async () => 'token', async (input, init) => {
      const url = String(input);
      requests.push(`${init?.method}:${url}`);
      if (init?.method === 'POST' && url.endsWith('/artwork')) throw new Error('socket closed after render');
      if (init?.method === 'GET' && url.endsWith('/artwork/status')) {
        return new Response(JSON.stringify({ artwork }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      throw new Error('Unexpected request');
    });

    expect(await client.generate('scene-1')).toEqual(artwork);
    expect(requests).toEqual([
      'POST:https://api.test/v1/scenes/scene-1/artwork',
      'GET:https://api.test/v1/scenes/scene-1/artwork/status',
    ]);
  });

  it('rejects malformed snapshots and maps owner isolation to not_found', async () => {
    const malformed = new HttpSceneArtworkClient('https://api.test', async () => 'token', async () => (
      new Response(JSON.stringify({ artwork: { status: 'ready', attempts: -1 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    ));
    await expect(malformed.status('scene-1')).rejects.toMatchObject({ code: 'backend_unavailable' });

    const hidden = new HttpSceneArtworkClient('https://api.test', async () => 'token', async () => (
      new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    ));
    await expect(hidden.status('scene-1')).rejects.toEqual(expect.objectContaining<Partial<SceneArtworkClientError>>({ code: 'not_found' }));
  });
});
