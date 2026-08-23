import { AuthenticatedJsonTransport, HttpTransportError, type FetchLike, type TokenProvider } from '../../lib/http-transport';

export type SceneArtworkStatus = 'missing' | 'generating' | 'ready' | 'stale' | 'failed';

export interface SceneArtworkSnapshot {
  status: SceneArtworkStatus;
  current: boolean;
  attempts: number;
  updatedAt: string | null;
  readyAt: string | null;
}

export interface SceneArtworkClient {
  configured: boolean;
  status(sceneId: string): Promise<SceneArtworkSnapshot>;
  generate(sceneId: string): Promise<SceneArtworkSnapshot>;
  source(sceneId: string): Promise<{ uri: string }>;
}

export class SceneArtworkClientError extends Error {
  constructor(
    readonly code: 'not_configured' | 'auth_required' | 'not_found' | 'provider_unavailable' | 'backend_unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'SceneArtworkClientError';
  }
}

const ARTWORK_GENERATION_TIMEOUT_MS = 90_000;

export class HttpSceneArtworkClient implements SceneArtworkClient {
  readonly configured = true;
  private readonly transport: AuthenticatedJsonTransport;

  constructor(apiBaseUrl: string, tokenProvider: TokenProvider, fetcher: FetchLike = fetch) {
    this.transport = new AuthenticatedJsonTransport(apiBaseUrl, tokenProvider, fetcher);
  }

  async status(sceneId: string): Promise<SceneArtworkSnapshot> {
    return this.parse(await this.request(`/v1/scenes/${encodeURIComponent(sceneId)}/artwork/status`, 'GET'));
  }

  async generate(sceneId: string): Promise<SceneArtworkSnapshot> {
    try {
      return this.parse(await this.request(
        `/v1/scenes/${encodeURIComponent(sceneId)}/artwork`,
        'POST',
        ARTWORK_GENERATION_TIMEOUT_MS,
      ));
    } catch (error) {
      if (!(error instanceof SceneArtworkClientError) || error.code !== 'backend_unavailable') throw error;
      const reconciled = await this.status(sceneId).catch(() => null);
      if (reconciled?.status === 'ready' && reconciled.current) return reconciled;
      throw error;
    }
  }

  source(sceneId: string): Promise<{ uri: string }> {
    return this.transport.authorizedDataUriSource(`/v1/scenes/${encodeURIComponent(sceneId)}/artwork`);
  }

  private async request(path: string, method: 'GET' | 'POST', timeoutMs?: number): Promise<unknown> {
    try {
      const response = await this.transport.request(path, method, undefined, timeoutMs);
      if (!response.ok) throw mapError(response.status, response.payload);
      return response.payload;
    } catch (error) {
      if (error instanceof SceneArtworkClientError) throw error;
      if (error instanceof HttpTransportError && error.code === 'auth_required') {
        throw new SceneArtworkClientError('auth_required', 'Sign in before loading private Scene artwork.');
      }
      throw new SceneArtworkClientError('backend_unavailable', 'Scene artwork service could not be reached.');
    }
  }

  private parse(payload: unknown): SceneArtworkSnapshot {
    if (!isRecord(payload) || !isRecord(payload.artwork)) {
      throw new SceneArtworkClientError('backend_unavailable', 'Artwork response is invalid.');
    }
    const value = payload.artwork;
    if (
      !isArtworkStatus(value.status) || typeof value.current !== 'boolean' ||
      !Number.isInteger(value.attempts) || Number(value.attempts) < 0 ||
      !isNullableString(value.updatedAt) || !isNullableString(value.readyAt)
    ) {
      throw new SceneArtworkClientError('backend_unavailable', 'Artwork response is invalid.');
    }
    return {
      status: value.status,
      current: value.current,
      attempts: Number(value.attempts),
      updatedAt: value.updatedAt as string | null,
      readyAt: value.readyAt as string | null,
    };
  }
}

export class UnavailableSceneArtworkClient implements SceneArtworkClient {
  readonly configured = false;
  private fail(): never {
    throw new SceneArtworkClientError('not_configured', 'Scene artwork is not configured.');
  }
  async status(): Promise<SceneArtworkSnapshot> { return this.fail(); }
  async generate(): Promise<SceneArtworkSnapshot> { return this.fail(); }
  async source(): Promise<{ uri: string }> { return this.fail(); }
}

function mapError(status: number, payload: unknown): SceneArtworkClientError {
  const code = isRecord(payload) && typeof payload.error === 'string' ? payload.error : '';
  if (status === 401) return new SceneArtworkClientError('auth_required', 'Sign in before loading private Scene artwork.');
  if (status === 404 || code === 'not_found') return new SceneArtworkClientError('not_found', 'Scene artwork was not found.');
  if (status === 503 || code === 'provider_unavailable') {
    return new SceneArtworkClientError('provider_unavailable', 'Scene artwork generation is temporarily unavailable.');
  }
  return new SceneArtworkClientError('backend_unavailable', 'Scene artwork service could not complete the request.');
}

function isArtworkStatus(value: unknown): value is SceneArtworkStatus {
  return value === 'missing' || value === 'generating' || value === 'ready' || value === 'stale' || value === 'failed';
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
