import type { RevenueCatWebhookEvent } from './contracts';

const DEFAULT_TOLERANCE_SECONDS = 300;

export type RevenueCatWebhookVerification =
  | { ok: true; event: RevenueCatWebhookEvent }
  | { ok: false; code: 'unauthorized' | 'invalid_signature' | 'invalid_payload'; message: string };

export interface RevenueCatWebhookSecurityConfig {
  authorization: string;
  signingSecret: string;
}

export async function verifyRevenueCatWebhook(
  request: Request,
  config: RevenueCatWebhookSecurityConfig,
  clock: () => number = Date.now,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
): Promise<RevenueCatWebhookVerification> {
  if (!config.authorization || !config.signingSecret) {
    return { ok: false, code: 'unauthorized', message: 'Webhook security is not configured.' };
  }
  if (request.headers.get('Authorization') !== config.authorization) {
    return { ok: false, code: 'unauthorized', message: 'Webhook authorization is invalid.' };
  }

  const body = new Uint8Array(await request.arrayBuffer());
  const signatureHeader = request.headers.get('X-RevenueCat-Webhook-Signature');
  if (!(await validSignature(body, signatureHeader, config.signingSecret, clock(), toleranceSeconds))) {
    return { ok: false, code: 'invalid_signature', message: 'Webhook signature is invalid.' };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return { ok: false, code: 'invalid_payload', message: 'Webhook body is not valid JSON.' };
  }

  const event = parseWebhookEvent(payload);
  return event
    ? { ok: true, event }
    : { ok: false, code: 'invalid_payload', message: 'Webhook event fields are invalid.' };
}

async function validSignature(
  body: Uint8Array,
  header: string | null,
  secret: string,
  nowMs: number,
  toleranceSeconds: number,
): Promise<boolean> {
  if (!header || !Number.isFinite(nowMs) || toleranceSeconds < 0) return false;
  const parts = new Map<string, string>();
  for (const part of header.split(',')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    parts.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
  }

  const timestampText = parts.get('t');
  const signatureText = parts.get('v1');
  if (!timestampText || !signatureText || !/^\d+$/.test(timestampText) || !/^[a-fA-F0-9]{64}$/.test(signatureText)) {
    return false;
  }

  const timestampSeconds = Number(timestampText);
  if (!Number.isSafeInteger(timestampSeconds)) return false;
  if (Math.abs(Math.floor(nowMs / 1000) - timestampSeconds) > toleranceSeconds) return false;

  const prefix = new TextEncoder().encode(`${timestampText}.`);
  const signed = new Uint8Array(prefix.byteLength + body.byteLength);
  signed.set(prefix, 0);
  signed.set(body, prefix.byteLength);

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    return crypto.subtle.verify(
      'HMAC',
      key,
      toArrayBuffer(hexBytes(signatureText)),
      toArrayBuffer(signed),
    );
  } catch {
    return false;
  }
}

function parseWebhookEvent(payload: unknown): RevenueCatWebhookEvent | null {
  if (!isRecord(payload) || !isRecord(payload.event)) return null;
  const event = payload.event;
  if (!nonEmptyString(event.id, 255) || !nonEmptyString(event.app_user_id, 1500) || !nonEmptyString(event.type, 80)) {
    return null;
  }
  if (!Number.isSafeInteger(event.event_timestamp_ms) || Number(event.event_timestamp_ms) < 0) return null;

  const environment = event.environment === 'PRODUCTION' || event.environment === 'SANDBOX'
    ? event.environment
    : null;
  const entitlementIds = readEntitlementIds(event);
  const productId = optionalString(event.product_id, 255);
  const transactionId = optionalString(event.transaction_id, 255);
  if (productId === undefined || transactionId === undefined) return null;

  return {
    id: event.id,
    appUserId: event.app_user_id,
    type: event.type,
    environment,
    eventTimestampMs: Number(event.event_timestamp_ms),
    entitlementIds,
    productId,
    transactionId,
  };
}

function readEntitlementIds(event: Record<string, unknown>): string[] {
  const values = Array.isArray(event.entitlement_ids)
    ? event.entitlement_ids.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];
  if (values.length > 0) return [...new Set(values.map((value) => value.trim().slice(0, 255)))].slice(0, 20);
  return typeof event.entitlement_id === 'string' && event.entitlement_id.trim()
    ? [event.entitlement_id.trim().slice(0, 255)]
    : [];
}

function optionalString(value: unknown, maxLength: number): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return undefined;
  return normalized;
}

function nonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value === value.trim() && value.length > 0 && value.length <= maxLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function hexBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}
