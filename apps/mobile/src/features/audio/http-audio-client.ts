import type { MediaAsset, MediaAssetStatus } from '@/features/drama/domain';
import type { SceneVoiceClient, SceneVoicePlaybackSource } from './contracts';
import { SceneVoiceClientError } from './contracts';
import { AuthenticatedJsonTransport, HttpTransportError, type FetchLike, type TokenProvider } from '../../lib/http-transport';

export class HttpSceneVoiceClient implements SceneVoiceClient {
  readonly configured: boolean;
  private readonly transport: AuthenticatedJsonTransport;

  constructor(
    apiBaseUrl: string,
    tokenProvider: TokenProvider,
    fetcher: FetchLike = fetch,
    timeoutMs = 12_000,
  ) {
    this.configured = Boolean(apiBaseUrl.trim());
    this.transport = new AuthenticatedJsonTransport(apiBaseUrl, tokenProvider, fetcher, timeoutMs);
  }

  async request(sceneId: string, voiceVariant: string, reservationKey: string): Promise<MediaAsset> {
    const payload = await this.requestJson(`/v1/scenes/${encodeURIComponent(sceneId)}/voice`, 'POST', {
      voiceVariant,
      reservationKey,
    });
    return parseVoiceEnvelope(payload);
  }

  async loadStatus(assetId: string): Promise<MediaAsset> {
    return parseVoiceEnvelope(await this.requestJson(`/v1/media/${encodeURIComponent(assetId)}/status`, 'GET'));
  }

  async playbackSource(assetId: string): Promise<SceneVoicePlaybackSource> {
    try {
      return await this.transport.authorizedSource(`/v1/media/${encodeURIComponent(assetId)}`);
    } catch (error) {
      throw mapTransportError(error);
    }
  }

  private async requestJson(path: string, method: 'GET' | 'POST', body?: unknown): Promise<unknown> {
    try {
      const response = await this.transport.request(path, method, body);
      if (!response.jsonValid && response.ok) throw invalidResponse();
      if (!response.ok) throw mapVoiceHttpError(response.status, response.payload);
      return response.payload;
    } catch (error) {
      if (error instanceof SceneVoiceClientError) throw error;
      throw mapTransportError(error);
    }
  }
}

export class UnavailableSceneVoiceClient implements SceneVoiceClient {
  readonly configured = false;

  private fail(): never {
    throw new SceneVoiceClientError('not_configured', 'Live voice is available when Clerk and the Living Plot API are configured.');
  }

  async request(): Promise<MediaAsset> { return this.fail(); }
  async loadStatus(): Promise<MediaAsset> { return this.fail(); }
  async playbackSource(): Promise<SceneVoicePlaybackSource> { return this.fail(); }
}

function parseVoiceEnvelope(payload: unknown): MediaAsset {
  if (!isRecord(payload) || !isRecord(payload.media)) throw invalidResponse();
  const media = payload.media;
  if (
    typeof media.id !== 'string' || typeof media.sceneId !== 'string' || media.kind !== 'voice' ||
    typeof media.variant !== 'string' || !isStatus(media.status) ||
    !Number.isInteger(media.attempts) || typeof media.cached !== 'boolean' ||
    (media.failureCode !== null && typeof media.failureCode !== 'string')
  ) throw invalidResponse();
  return {
    id: media.id,
    sceneId: media.sceneId,
    kind: 'voice',
    variant: media.variant,
    status: media.status,
    attempts: Number(media.attempts),
    cached: media.cached,
    failureCode: media.failureCode,
  };
}

function mapTransportError(error: unknown): SceneVoiceClientError {
  if (!(error instanceof HttpTransportError)) return new SceneVoiceClientError('backend_unavailable', 'Voice service could not be reached.');
  if (error.code === 'not_configured') return new SceneVoiceClientError('not_configured', 'Live voice requires the Living Plot API URL.');
  if (error.code === 'auth_required') return new SceneVoiceClientError('auth_required', 'Sign in before generating or playing private voice audio.');
  return new SceneVoiceClientError(
    'backend_unavailable',
    error.code === 'timeout' ? 'Voice service took too long to respond.' : 'Voice service could not be reached.',
  );
}

function mapVoiceHttpError(status: number, payload: unknown): SceneVoiceClientError {
  const code = isRecord(payload) && typeof payload.error === 'string' ? payload.error : '';
  if (status === 401) return new SceneVoiceClientError('auth_required', 'Your session expired. Sign in again.');
  if (status === 404 || code === 'not_found') return new SceneVoiceClientError('not_found', 'Voice media was not found for this scene.');
  if (status === 429 || code === 'quota_exceeded') return new SceneVoiceClientError('quota_exceeded', 'Today’s fresh voice allowance is exhausted.');
  if (code === 'queue_unavailable') return new SceneVoiceClientError('queue_unavailable', 'Voice generation could not be queued.');
  if (code === 'audio_unavailable') return new SceneVoiceClientError('audio_unavailable', 'Generated voice media is temporarily unavailable.');
  return new SceneVoiceClientError('backend_unavailable', 'Voice service could not complete the request.');
}

function invalidResponse(): SceneVoiceClientError {
  return new SceneVoiceClientError('backend_unavailable', 'Voice service returned an invalid response.');
}

function isStatus(value: unknown): value is MediaAssetStatus {
  return value === 'queued' || value === 'processing' || value === 'ready' || value === 'failed';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
