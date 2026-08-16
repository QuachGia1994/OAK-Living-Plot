import { describe, expect, it } from 'vitest';
import { verifyRevenueCatWebhook } from '../src/billing/revenuecat-webhook-verifier';
import {
  revenueCatWebhookPayload,
  signedWebhookRequest,
  WEBHOOK_AUTHORIZATION,
  WEBHOOK_NOW_MS,
  WEBHOOK_SIGNING_SECRET,
} from './billing-fixtures';

const security = {
  authorization: WEBHOOK_AUTHORIZATION,
  signingSecret: WEBHOOK_SIGNING_SECRET,
};

describe('RevenueCat webhook verification', () => {
  it('verifies authorization and HMAC over the raw body before parsing', async () => {
    const result = await verifyRevenueCatWebhook(
      await signedWebhookRequest(revenueCatWebhookPayload()),
      security,
      () => WEBHOOK_NOW_MS,
    );

    expect(result).toMatchObject({
      ok: true,
      event: {
        id: 'rc-event-001',
        appUserId: 'user-1',
        type: 'INITIAL_PURCHASE',
        environment: 'SANDBOX',
        entitlementIds: ['plus'],
      },
    });
  });

  it('rejects the request when the authorization header is wrong', async () => {
    const result = await verifyRevenueCatWebhook(
      await signedWebhookRequest(revenueCatWebhookPayload(), { authorization: 'Bearer wrong' }),
      security,
      () => WEBHOOK_NOW_MS,
    );

    expect(result).toMatchObject({ ok: false, code: 'unauthorized' });
  });

  it('rejects a valid HMAC after the raw JSON bytes are changed', async () => {
    const original = await signedWebhookRequest(revenueCatWebhookPayload());
    const signature = original.headers.get('X-RevenueCat-Webhook-Signature') ?? '';
    const mutatedBody = `${JSON.stringify(revenueCatWebhookPayload())} `;
    const mutated = new Request(original.url, {
      method: 'POST',
      headers: {
        Authorization: WEBHOOK_AUTHORIZATION,
        'X-RevenueCat-Webhook-Signature': signature,
      },
      body: mutatedBody,
    });

    const result = await verifyRevenueCatWebhook(mutated, security, () => WEBHOOK_NOW_MS);

    expect(result).toMatchObject({ ok: false, code: 'invalid_signature' });
  });

  it('rejects a signed request outside the five-minute replay window', async () => {
    const result = await verifyRevenueCatWebhook(
      await signedWebhookRequest(revenueCatWebhookPayload(), {
        timestampSeconds: Math.floor(WEBHOOK_NOW_MS / 1000) - 301,
      }),
      security,
      () => WEBHOOK_NOW_MS,
    );

    expect(result).toMatchObject({ ok: false, code: 'invalid_signature' });
  });
});
