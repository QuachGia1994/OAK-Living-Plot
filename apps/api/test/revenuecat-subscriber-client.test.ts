import { describe, expect, it } from 'vitest';
import { RevenueCatSubscriberClient } from '../src/billing/revenuecat-subscriber-client';

const requestDateMs = Date.parse('2026-08-16T09:30:00.000Z');

function response(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

describe('RevenueCatSubscriberClient', () => {
  it('fetches the canonical subscriber with a server API key and maps an active Plus entitlement', async () => {
    let capturedUrl = '';
    let capturedAuthorization = '';
    const client = new RevenueCatSubscriberClient('server-secret', 'plus', async (input, init) => {
      capturedUrl = String(input);
      capturedAuthorization = new Headers(init?.headers).get('Authorization') ?? '';
      return response({
        request_date_ms: requestDateMs,
        subscriber: {
          entitlements: {
            plus: {
              expires_date: '2026-09-16T09:30:00.000Z',
              grace_period_expires_date: null,
            },
          },
        },
      });
    });

    const result = await client.fetchEntitlement('user/with space');

    expect(result).toEqual({
      ok: true,
      value: {
        appUserId: 'user/with space',
        tier: 'plus',
        plusExpiresAt: Date.parse('2026-09-16T09:30:00.000Z'),
        requestDateMs,
      },
    });
    expect(capturedUrl).toContain('user%2Fwith%20space');
    expect(capturedAuthorization).toBe('Bearer server-secret');
  });

  it('treats a non-expiring entitlement as lifetime Plus', async () => {
    const client = new RevenueCatSubscriberClient('server-secret', 'plus', async () => response({
      request_date_ms: requestDateMs,
      subscriber: {
        entitlements: {
          plus: { expires_date: null, grace_period_expires_date: null },
        },
      },
    }));

    const result = await client.fetchEntitlement('user-1');

    expect(result).toEqual({
      ok: true,
      value: { appUserId: 'user-1', tier: 'plus', plusExpiresAt: null, requestDateMs },
    });
  });

  it('honors an access-granting grace period and drops expired entitlement to Free', async () => {
    const graceClient = new RevenueCatSubscriberClient('server-secret', 'plus', async () => response({
      request_date_ms: requestDateMs,
      subscriber: {
        entitlements: {
          plus: {
            expires_date: '2026-08-15T09:30:00.000Z',
            grace_period_expires_date: '2026-08-17T09:30:00.000Z',
          },
        },
      },
    }));
    const expiredClient = new RevenueCatSubscriberClient('server-secret', 'plus', async () => response({
      request_date_ms: requestDateMs,
      subscriber: {
        entitlements: {
          plus: {
            expires_date: '2026-08-15T09:30:00.000Z',
            grace_period_expires_date: null,
          },
        },
      },
    }));

    const grace = await graceClient.fetchEntitlement('user-1');
    const expired = await expiredClient.fetchEntitlement('user-1');

    expect(grace).toMatchObject({ ok: true, value: { tier: 'plus', plusExpiresAt: Date.parse('2026-08-17T09:30:00.000Z') } });
    expect(expired).toEqual({
      ok: true,
      value: { appUserId: 'user-1', tier: 'free', plusExpiresAt: null, requestDateMs },
    });
  });

  it('normalizes provider errors and malformed responses without leaking the API key', async () => {
    const unavailable = new RevenueCatSubscriberClient('very-secret-value', 'plus', async () => response({ error: 'down' }, 503));
    const malformed = new RevenueCatSubscriberClient('very-secret-value', 'plus', async () => response({ subscriber: {} }));

    const first = await unavailable.fetchEntitlement('user-1');
    const second = await malformed.fetchEntitlement('user-1');

    expect(first).toMatchObject({ ok: false, error: { code: 'provider_unavailable', retryable: true } });
    expect(second).toMatchObject({ ok: false, error: { code: 'invalid_response' } });
    expect(JSON.stringify([first, second])).not.toContain('very-secret-value');
  });
});
