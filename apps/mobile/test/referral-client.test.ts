import { describe, expect, it } from 'vitest';
import { HttpReferralClient, ReferralClientError } from '../src/features/referrals/referral-client';

const snapshot = { code: 'ABCDEFGH', claimedCode: null, bonusVoiceCredits: 50, successfulReferrals: 1 };

describe('HttpReferralClient', () => {
  it('loads and claims referral state with the authenticated transport', async () => {
    const requests: { url: string; method: string; authorization: string | null; body: unknown }[] = [];
    const client = new HttpReferralClient('https://api.test', async () => 'token-1', async (input, init) => {
      requests.push({
        url: String(input),
        method: String(init?.method),
        authorization: new Headers(init?.headers).get('Authorization'),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return new Response(JSON.stringify({ referral: snapshot }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    expect(await client.load()).toEqual(snapshot);
    expect(await client.claim('abcdefgh')).toEqual(snapshot);
    expect(requests).toEqual([
      { url: 'https://api.test/v1/referrals/me', method: 'GET', authorization: 'Bearer token-1', body: null },
      { url: 'https://api.test/v1/referrals/claim', method: 'POST', authorization: 'Bearer token-1', body: { code: 'ABCDEFGH' } },
    ]);
  });

  it('rejects malformed codes locally and maps conflicting or too-late claims', async () => {
    const local = new HttpReferralClient('https://api.test', async () => 'token', async () => new Response('{}', { status: 200 }));
    await expect(local.claim('bad')).rejects.toMatchObject({ code: 'invalid_code' });

    const conflict = new HttpReferralClient('https://api.test', async () => 'token', async () => new Response(JSON.stringify({ error: 'already_claimed' }), { status: 409 }));
    await expect(conflict.claim('ABCDEFGH')).rejects.toEqual(expect.objectContaining<Partial<ReferralClientError>>({ code: 'already_claimed' }));

    const tooLate = new HttpReferralClient('https://api.test', async () => 'token', async () => new Response(JSON.stringify({ error: 'plus_already_active' }), { status: 409 }));
    await expect(tooLate.claim('ABCDEFGH')).rejects.toEqual(expect.objectContaining<Partial<ReferralClientError>>({ code: 'plus_already_active' }));
  });
});
