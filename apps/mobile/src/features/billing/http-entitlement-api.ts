import type { BackendEntitlement, EntitlementApi } from './contracts';
import { BillingClientError } from './contracts';

export class HttpEntitlementApi implements EntitlementApi {
  constructor(private readonly apiBaseUrl: string) {}

  async loadEntitlement(bearerToken: string): Promise<BackendEntitlement> {
    if (!this.apiBaseUrl.trim() || !bearerToken.trim()) {
      throw new BillingClientError('invalid_session', 'Backend URL and bearer token are required.');
    }

    let response: Response;
    try {
      response = await fetch(`${this.apiBaseUrl.replace(/\/$/, '')}/v1/entitlement`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
    } catch {
      throw new BillingClientError('backend_unavailable', 'The entitlement server could not be reached.');
    }

    if (!response.ok) {
      throw new BillingClientError('backend_unavailable', 'The entitlement server rejected the refresh request.');
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new BillingClientError('backend_unavailable', 'The entitlement response is invalid.');
    }

    const entitlement = parseEntitlement(payload);
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
