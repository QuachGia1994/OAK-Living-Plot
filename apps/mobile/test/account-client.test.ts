import { describe, expect, it, vi } from 'vitest';
import { HttpAccountDataClient } from '../src/features/account/http-account-client';

describe('HttpAccountDataClient', () => {
  it('validates portable export shape', async () => {
    const client = new HttpAccountDataClient('https://api.test', async () => 'token', async () => Response.json({
      export: {
        schemaVersion: 3,
        exportedAt: '2026-08-17T04:30:00.000Z',
        preferences: {}, entitlement: {}, usage: [], referral: {}, dramas: [],
      },
    }));
    await expect(client.loadExport()).resolves.toMatchObject({ schemaVersion: 3, referral: {}, dramas: [] });
  });

  it('rejects malformed export and never retries account deletion automatically', async () => {
    const malformed = new HttpAccountDataClient('https://api.test', async () => 'token', async () => Response.json({ export: { schemaVersion: 1 } }));
    await expect(malformed.loadExport()).rejects.toThrow('Account export response is invalid.');

    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: 'audio_cleanup_failed' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    }));
    const client = new HttpAccountDataClient('https://api.test', async () => 'token', fetcher);
    await expect(client.deleteAccount('DELETE MY LIVING PLOT DATA')).rejects.toThrow('Private media cleanup could not finish');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
