import { describe, expect, it } from 'vitest';
import { HttpCharacterPortraitClient } from '../src/features/portrait/portrait-client';

const portrait = { status: 'ready', current: true, attempts: 1, updatedAt: '2026-08-19T12:00:00.000Z', readyAt: '2026-08-19T12:00:00.000Z' };

describe('HttpCharacterPortraitClient', () => {
  it('keeps generated portrait media behind fresh bearer authorization', async () => {
    let token = 0;
    const requests: string[] = [];
    const client = new HttpCharacterPortraitClient('https://api.test', async () => `token-${++token}`, async (input, init) => {
      requests.push(`${init?.method}:${String(input)}:${new Headers(init?.headers).get('Authorization')}`);
      return new Response(JSON.stringify({ portrait }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    expect(await client.status('plot-1')).toEqual(portrait);
    expect(await client.generate('plot-1')).toEqual(portrait);
    expect(await client.source('plot-1')).toEqual({
      uri: 'https://api.test/v1/dramas/plot-1/portrait',
      headers: { Authorization: 'Bearer token-3' },
    });
    expect(requests).toEqual([
      'GET:https://api.test/v1/dramas/plot-1/portrait/status:Bearer token-1',
      'POST:https://api.test/v1/dramas/plot-1/portrait:Bearer token-2',
    ]);
  });
});
