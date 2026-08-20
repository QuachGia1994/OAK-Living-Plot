import { AuthenticatedJsonTransport, HttpTransportError, type FetchLike, type TokenProvider } from '../../lib/http-transport';

export type PortraitStatus = 'missing' | 'generating' | 'ready' | 'stale' | 'failed';

export interface PortraitSnapshot {
  status: PortraitStatus;
  current: boolean;
  attempts: number;
  updatedAt: string | null;
  readyAt: string | null;
}

export interface CharacterPortraitClient {
  configured: boolean;
  status(dramaId: string): Promise<PortraitSnapshot>;
  generate(dramaId: string): Promise<PortraitSnapshot>;
  source(dramaId: string): Promise<{ uri: string }>;
}

export class CharacterPortraitClientError extends Error {
  constructor(
    readonly code: 'not_configured' | 'auth_required' | 'not_found' | 'provider_unavailable' | 'backend_unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'CharacterPortraitClientError';
  }
}

export class HttpCharacterPortraitClient implements CharacterPortraitClient {
  readonly configured = true;
  private readonly transport: AuthenticatedJsonTransport;

  constructor(apiBaseUrl: string, tokenProvider: TokenProvider, fetcher: FetchLike = fetch) {
    this.transport = new AuthenticatedJsonTransport(apiBaseUrl, tokenProvider, fetcher);
  }

  async status(dramaId: string): Promise<PortraitSnapshot> {
    return this.parse(await this.request(`/v1/dramas/${encodeURIComponent(dramaId)}/portrait/status`, 'GET'));
  }

  async generate(dramaId: string): Promise<PortraitSnapshot> {
    return this.parse(await this.request(`/v1/dramas/${encodeURIComponent(dramaId)}/portrait`, 'POST', undefined, 30_000));
  }

  source(dramaId: string): Promise<{ uri: string }> {
    return this.transport.authorizedDataUriSource(`/v1/dramas/${encodeURIComponent(dramaId)}/portrait`);
  }

  private async request(path: string, method: 'GET' | 'POST', body?: unknown, timeoutMs?: number): Promise<unknown> {
    try {
      const response = await this.transport.request(path, method, body, timeoutMs);
      if (!response.ok) throw mapError(response.status, response.payload);
      return response.payload;
    } catch (error) {
      if (error instanceof CharacterPortraitClientError) throw error;
      if (error instanceof HttpTransportError && error.code === 'auth_required') {
        throw new CharacterPortraitClientError('auth_required', 'Sign in before loading a private character portrait.');
      }
      throw new CharacterPortraitClientError('backend_unavailable', 'Character portrait service could not be reached.');
    }
  }

  private parse(payload: unknown): PortraitSnapshot {
    if (!isRecord(payload) || !isRecord(payload.portrait)) throw new CharacterPortraitClientError('backend_unavailable', 'Portrait response is invalid.');
    const value = payload.portrait;
    if (
      !isPortraitStatus(value.status) || typeof value.current !== 'boolean' ||
      !Number.isInteger(value.attempts) || Number(value.attempts) < 0 ||
      !isNullableString(value.updatedAt) || !isNullableString(value.readyAt)
    ) throw new CharacterPortraitClientError('backend_unavailable', 'Portrait response is invalid.');
    return {
      status: value.status,
      current: value.current,
      attempts: Number(value.attempts),
      updatedAt: value.updatedAt as string | null,
      readyAt: value.readyAt as string | null,
    };
  }
}

export class UnavailableCharacterPortraitClient implements CharacterPortraitClient {
  readonly configured = false;
  private fail(): never { throw new CharacterPortraitClientError('not_configured', 'Character portraits are not configured.'); }
  async status(): Promise<PortraitSnapshot> { return this.fail(); }
  async generate(): Promise<PortraitSnapshot> { return this.fail(); }
  async source(): Promise<{ uri: string }> { return this.fail(); }
}

function mapError(status: number, payload: unknown): CharacterPortraitClientError {
  const code = isRecord(payload) && typeof payload.error === 'string' ? payload.error : '';
  if (status === 401) return new CharacterPortraitClientError('auth_required', 'Sign in before loading a private character portrait.');
  if (status === 404 || code === 'not_found') return new CharacterPortraitClientError('not_found', 'Drama portrait was not found.');
  if (status === 503 || code === 'provider_unavailable') return new CharacterPortraitClientError('provider_unavailable', 'Character portrait generation is temporarily unavailable.');
  return new CharacterPortraitClientError('backend_unavailable', 'Character portrait service could not complete the request.');
}

function isPortraitStatus(value: unknown): value is PortraitStatus {
  return value === 'missing' || value === 'generating' || value === 'ready' || value === 'stale' || value === 'failed';
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
