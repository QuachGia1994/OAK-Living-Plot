import { AuthenticatedJsonTransport, type FetchLike, type TokenProvider } from '../../lib/http-transport';
import type { AccountDataClient, AccountExportSnapshot } from './contracts';

export class HttpAccountDataClient implements AccountDataClient {
  readonly configured = true;
  private readonly transport: AuthenticatedJsonTransport;

  constructor(apiBaseUrl: string, tokenProvider: TokenProvider, fetcher: FetchLike = fetch) {
    this.transport = new AuthenticatedJsonTransport(apiBaseUrl, tokenProvider, fetcher);
  }

  async loadExport(): Promise<AccountExportSnapshot> {
    const response = await this.transport.request('/v1/account/export', 'GET');
    if (!response.ok || !response.jsonValid || !isRecord(response.payload) || !isRecord(response.payload.export)) {
      throw new Error('Account export is unavailable.');
    }
    return parseExport(response.payload.export);
  }

  async deleteAccount(confirmation: string): Promise<void> {
    const response = await this.transport.request('/v1/account/delete', 'POST', { confirmation });
    if (!response.ok || !response.jsonValid || !isRecord(response.payload) || response.payload.deleted !== true) {
      throw new Error(deleteErrorMessage(response.status, response.payload));
    }
  }
}

export class UnavailableAccountDataClient implements AccountDataClient {
  readonly configured = false;
  async loadExport(): Promise<AccountExportSnapshot> { throw new Error('Live account data is unavailable in preview mode.'); }
  async deleteAccount(): Promise<void> { throw new Error('Live account deletion is unavailable in preview mode.'); }
}

function parseExport(value: Record<string, unknown>): AccountExportSnapshot {
  if (
    value.schemaVersion !== 2 || typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt)) ||
    !isRecord(value.preferences) || !isRecord(value.entitlement) || !Array.isArray(value.usage) || !Array.isArray(value.dramas)
  ) throw new Error('Account export response is invalid.');
  return {
    schemaVersion: 2,
    exportedAt: value.exportedAt,
    preferences: value.preferences,
    entitlement: value.entitlement,
    usage: value.usage,
    dramas: value.dramas,
  };
}

function deleteErrorMessage(status: number, payload: unknown): string {
  const code = isRecord(payload) && typeof payload.error === 'string' ? payload.error : '';
  if (status === 400 && code === 'invalid_confirmation') return 'The deletion confirmation phrase did not match.';
  if (status === 503 && code === 'audio_cleanup_failed') return 'Private audio cleanup could not finish, so account data was kept for a safe retry.';
  return 'Account data could not be deleted.';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
