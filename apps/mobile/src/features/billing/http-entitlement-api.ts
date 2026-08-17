import type { BackendEntitlement, EntitlementApi } from './contracts';
import { BillingClientError } from './contracts';
import { AuthenticatedJsonTransport, HttpTransportError, type FetchLike, type JsonHttpResponse } from '../../lib/http-transport';

export class HttpEntitlementApi implements EntitlementApi {
  constructor(
    private readonly apiBaseUrl: string,
    private readonly fetcher: FetchLike = fetch,
    private readonly timeoutMs = 12_000,
  ) {}

  async loadEntitlement(bearerToken: string): Promise<BackendEntitlement> {
    if (!this.apiBaseUrl.trim() || !bearerToken.trim()) {
      throw new BillingClientError('invalid_session', 'Backend URL and bearer token are required.');
    }

    const transport = new AuthenticatedJsonTransport(
      this.apiBaseUrl,
      async () => bearerToken,
      this.fetcher,
      this.timeoutMs,
    );
    let response: JsonHttpResponse;
    try {
      response = await transport.request('/v1/entitlement', 'GET');
    } catch (error) {
      throw new BillingClientError(
        'backend_unavailable',
        error instanceof HttpTransportError && error.code === 'timeout'
          ? 'The entitlement server took too long to respond.'
          : 'The entitlement server could not be reached.',
      );
    }
    if (!response.ok) throw new BillingClientError('backend_unavailable', 'The entitlement server rejected the refresh request.');
    if (!response.jsonValid) throw new BillingClientError('backend_unavailable', 'The entitlement response is invalid.');

    const entitlement = parseEntitlement(response.payload);
    if (!entitlement) {
      throw new BillingClientError('backend_unavailable', 'The entitlement response is invalid.');
    }
    return entitlement;
  }
}

function parseEntitlement(payload: unknown): BackendEntitlement | null {
  if (!isRecord(payload) || !isRecord(payload.entitlement)) return null;
  const value = payload.entitlement;
  if (value.tier !== 'free' && value.tier !== 'plus') return null;
  if (typeof value.plusActive !== 'boolean') return null;
  const expiresAt = optionalIso(value.expiresAt);
  const syncedAt = optionalIso(value.syncedAt);
  if (expiresAt === undefined || syncedAt === undefined) return null;
  if ((value.tier === 'plus') !== value.plusActive) return null;
  return { tier: value.tier, plusActive: value.plusActive, expiresAt, syncedAt };
}

function optionalIso(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return undefined;
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
