import type { RevenueCatWebhookEvent } from '../src/billing/contracts';

export const WEBHOOK_AUTHORIZATION = 'Bearer webhook-test-secret';
export const WEBHOOK_SIGNING_SECRET = 'revenuecat-signing-test-secret';
export const WEBHOOK_NOW_MS = Date.parse('2026-08-16T09:30:00.000Z');

export function revenueCatWebhookPayload(
  appUserId = 'user-1',
  id = 'rc-event-001',
  eventType = 'INITIAL_PURCHASE',
): Record<string, unknown> {
  return {
    api_version: '1.0',
    event: {
      id,
      app_user_id: appUserId,
      type: eventType,
      environment: 'SANDBOX',
      event_timestamp_ms: WEBHOOK_NOW_MS - 1000,
      entitlement_ids: ['plus'],
      product_id: 'oak_plus_monthly',
      transaction_id: `tx-${id}`,
    },
  };
}

export async function signedWebhookRequest(
  payload: unknown,
  options: { authorization?: string; signingSecret?: string; timestampSeconds?: number } = {},
): Promise<Request> {
  const body = JSON.stringify(payload);
  const timestamp = options.timestampSeconds ?? Math.floor(WEBHOOK_NOW_MS / 1000);
  const signature = await hmacHex(`${timestamp}.${body}`, options.signingSecret ?? WEBHOOK_SIGNING_SECRET);
  return new Request('https://living-plot.test/v1/webhooks/revenuecat', {
    method: 'POST',
    headers: {
      Authorization: options.authorization ?? WEBHOOK_AUTHORIZATION,
      'Content-Type': 'application/json',
      'X-RevenueCat-Webhook-Signature': `t=${timestamp},v1=${signature}`,
    },
    body,
  });
}

export function providerSnapshot(
  appUserId = 'user-1',
  tier: 'free' | 'plus' = 'plus',
  requestDateMs = WEBHOOK_NOW_MS,
) {
  return {
    appUserId,
    tier,
    plusExpiresAt: tier === 'plus' ? WEBHOOK_NOW_MS + 30 * 24 * 60 * 60 * 1000 : null,
    requestDateMs,
  } as const;
}

export function webhookEvent(
  appUserId = 'user-1',
  id = 'rc-event-001',
  type = 'INITIAL_PURCHASE',
): RevenueCatWebhookEvent {
  return {
    id,
    appUserId,
    type,
    environment: 'SANDBOX',
    eventTimestampMs: WEBHOOK_NOW_MS - 1000,
    entitlementIds: ['plus'],
    productId: 'oak_plus_monthly',
    transactionId: `tx-${id}`,
  };
}

async function hmacHex(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
  return [...signature].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
