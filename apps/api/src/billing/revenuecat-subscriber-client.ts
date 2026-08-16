import type {
  RevenueCatProviderResult,
  RevenueCatSubscriberProvider,
} from './contracts';

type Fetcher = typeof fetch;

const BASE_URL = 'https://api.revenuecat.com/v1/subscribers';

export class RevenueCatSubscriberClient implements RevenueCatSubscriberProvider {
  constructor(
    private readonly apiKey: string,
    private readonly plusEntitlementId: string,
    private readonly fetcher: Fetcher = fetch,
    private readonly timeoutMs = 8000,
  ) {}

  async fetchEntitlement(appUserId: string): Promise<RevenueCatProviderResult> {
    if (!this.apiKey.trim() || !this.plusEntitlementId.trim()) {
      return {
        ok: false,
        error: { code: 'invalid_configuration', message: 'RevenueCat server configuration is incomplete.', retryable: false },
      };
    }
    if (!appUserId.trim() || appUserId.length > 1500) {
      return {
        ok: false,
        error: { code: 'invalid_response', message: 'RevenueCat App User ID is invalid.', retryable: false },
      };
    }

    let response: Response;
    try {
      response = await this.fetcher(`${BASE_URL}/${encodeURIComponent(appUserId)}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      return {
        ok: false,
        error: { code: 'provider_unavailable', message: 'RevenueCat subscriber lookup failed.', retryable: true },
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        error: {
          code: 'provider_unavailable',
          message: 'RevenueCat subscriber lookup was rejected.',
          retryable: response.status === 429 || response.status >= 500,
        },
      };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return invalidResponse();
    }

    return parseSubscriber(payload, appUserId, this.plusEntitlementId);
  }
}

function parseSubscriber(payload: unknown, appUserId: string, plusEntitlementId: string): RevenueCatProviderResult {
  if (!isRecord(payload) || !Number.isSafeInteger(payload.request_date_ms) || !isRecord(payload.subscriber)) {
    return invalidResponse();
  }
  const entitlements = payload.subscriber.entitlements;
  if (!isRecord(entitlements)) return invalidResponse();

  const requestDateMs = Number(payload.request_date_ms);
  const plus = entitlements[plusEntitlementId];
  if (plus === undefined) {
    return { ok: true, value: { appUserId, tier: 'free', plusExpiresAt: null, requestDateMs } };
  }
  if (!isRecord(plus)) return invalidResponse();

  const expires = parseDateField(plus.expires_date);
  const grace = parseDateField(plus.grace_period_expires_date);
  if (expires === undefined || grace === undefined) return invalidResponse();

  if (expires === null && grace === null) {
    return { ok: true, value: { appUserId, tier: 'plus', plusExpiresAt: null, requestDateMs } };
  }

  const accessUntil = Math.max(expires ?? 0, grace ?? 0);
  return accessUntil > requestDateMs
    ? { ok: true, value: { appUserId, tier: 'plus', plusExpiresAt: accessUntil, requestDateMs } }
    : { ok: true, value: { appUserId, tier: 'free', plusExpiresAt: null, requestDateMs } };
}

function parseDateField(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function invalidResponse(): RevenueCatProviderResult {
  return {
    ok: false,
    error: { code: 'invalid_response', message: 'RevenueCat subscriber response is invalid.', retryable: true },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
