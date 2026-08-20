import { describe, expect, it } from 'vitest';
import { HttpCharacterPortraitClient } from '../src/features/portrait/portrait-client';

const portrait = { status: 'ready', current: true, attempts: 1, updatedAt: '2026-08-19T12:00:00.000Z', readyAt: '2026-08-19T12:00:00.000Z' };

describe('HttpCharacterPortraitClient', () => {
  it('fetches private portrait bytes with a fresh bearer token before handing media to the native image view', async () => {
    let token = 0;
    const requests: string[] = [];
    const client = new HttpCharacterPortraitClient('https://api.test', async () => `token-${++token}`, async (input, init) => {
      const url = String(input);
      requests.push(`${init?.method}:${url}:${new Headers(init?.headers).get('Authorization')}`);
      if (init?.method === 'GET' && url.endsWith('/portrait')) {
        return new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        });
      }
      return new Response(JSON.stringify({ portrait }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    expect(await client.status('plot-1')).toEqual(portrait);
    expect(await client.generate('plot-1')).toEqual(portrait);
    expect(await client.source('plot-1')).toEqual({ uri: 'data:image/jpeg;base64,/9j/' });
    expect(requests).toEqual([
      'GET:https://api.test/v1/dramas/plot-1/portrait/status:Bearer token-1',
      'POST:https://api.test/v1/dramas/plot-1/portrait:Bearer token-2',
      'GET:https://api.test/v1/dramas/plot-1/portrait:Bearer token-3',
    ]);
  });

  it('reconciles a transport failure against server status so a completed portrait is not reported as failed', async () => {
    const requests: string[] = [];
    const client = new HttpCharacterPortraitClient('https://api.test', async () => 'token', async (input, init) => {
      const url = String(input);
      requests.push(`${init?.method}:${url}`);
      if (init?.method === 'POST' && url.endsWith('/portrait')) throw new Error('socket closed after provider finished');
      if (init?.method === 'GET' && url.endsWith('/portrait/status')) {
        return new Response(JSON.stringify({ portrait }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      throw new Error('Unexpected request');
    });

    expect(await client.generate('plot-1')).toEqual(portrait);
    expect(requests).toEqual([
      'POST:https://api.test/v1/dramas/plot-1/portrait',
      'GET:https://api.test/v1/dramas/plot-1/portrait/status',
    ]);
  });

  it('refreshes the bearer token once when private portrait delivery returns unauthorized', async () => {
    let token = 0;
    let mediaCalls = 0;
    const client = new HttpCharacterPortraitClient('https://api.test', async () => `token-${++token}`, async (input, init) => {
      const url = String(input);
      if (init?.method === 'GET' && url.endsWith('/portrait')) {
        mediaCalls += 1;
        if (mediaCalls === 1) return new Response(null, { status: 401 });
        expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token-2');
        return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        });
      }
      throw new Error('Unexpected request');
    });

    expect(await client.source('plot-1')).toEqual({ uri: 'data:image/png;base64,iVBORw==' });
    expect(mediaCalls).toBe(2);
  });
});
