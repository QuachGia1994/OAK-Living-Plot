import type {
  EpisodeAudioAsset,
  EpisodeAudioClient,
  EpisodeAudioPlaybackSource,
  EpisodeAudioStatus,
} from './contracts';
import { EpisodeAudioClientError } from './contracts';
import { AuthenticatedJsonTransport, HttpTransportError, type FetchLike, type TokenProvider } from '../../lib/http-transport';

export class HttpEpisodeAudioClient implements EpisodeAudioClient {
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

  async request(episodeId: string, voiceVariant: string, reservationKey: string): Promise<EpisodeAudioAsset> {
    const payload = await this.requestJson(`/v1/episodes/${encodeURIComponent(episodeId)}/audio`, 'POST', {
      voiceVariant,
      reservationKey,
    });
    return parseAudioEnvelope(payload);
  }

  async loadStatus(assetId: string): Promise<EpisodeAudioAsset> {
    return parseAudioEnvelope(await this.requestJson(`/v1/audio/${encodeURIComponent(assetId)}/status`, 'GET'));
  }

  async playbackSource(assetId: string): Promise<EpisodeAudioPlaybackSource> {
    try {
      return await this.transport.authorizedSource(`/v1/audio/${encodeURIComponent(assetId)}`);
    } catch (error) {
      throw mapTransportError(error);
    }
  }

  private async requestJson(path: string, method: 'GET' | 'POST', body?: unknown): Promise<unknown> {
    try {
      const response = await this.transport.request(path, method, body);
      if (!response.jsonValid && response.ok) throw invalidResponse();
      if (!response.ok) throw mapAudioHttpError(response.status, response.payload);
      return response.payload;
    } catch (error) {
      if (error instanceof EpisodeAudioClientError) throw error;
      throw mapTransportError(error);
    }
  }
}

export class UnavailableEpisodeAudioClient implements EpisodeAudioClient {
  readonly configured = false;

  private fail(): never {
    throw new EpisodeAudioClientError('not_configured', 'Live voice is available when Clerk and the Living Plot API are configured.');
  }

  async request(): Promise<EpisodeAudioAsset> { return this.fail(); }
  async loadStatus(): Promise<EpisodeAudioAsset> { return this.fail(); }
  async playbackSource(): Promise<EpisodeAudioPlaybackSource> { return this.fail(); }
}

function parseAudioEnvelope(payload: unknown): EpisodeAudioAsset {
  if (!isRecord(payload) || !isRecord(payload.audio)) throw invalidResponse();
  const audio = payload.audio;
  if (
    typeof audio.id !== 'string' || typeof audio.episodeId !== 'string' || typeof audio.voiceVariant !== 'string' ||
    !isStatus(audio.status) || !Number.isInteger(audio.inputCharacters) || !Number.isInteger(audio.attempts) ||
    typeof audio.cached !== 'boolean' || (audio.failureCode !== null && typeof audio.failureCode !== 'string')
  ) throw invalidResponse();
  return {
    id: audio.id,
    episodeId: audio.episodeId,
    voiceVariant: audio.voiceVariant,
    status: audio.status,
    inputCharacters: Number(audio.inputCharacters),
    attempts: Number(audio.attempts),
    cached: audio.cached,
    failureCode: audio.failureCode,
  };
}

function mapTransportError(error: unknown): EpisodeAudioClientError {
  if (!(error instanceof HttpTransportError)) {
    return new EpisodeAudioClientError('backend_unavailable', 'Voice service could not be reached.');
  }
  if (error.code === 'not_configured') {
    return new EpisodeAudioClientError('not_configured', 'Live voice requires the Living Plot API URL.');
  }
  if (error.code === 'auth_required') {
    return new EpisodeAudioClientError('auth_required', 'Sign in before generating or playing private voice audio.');
  }
  return new EpisodeAudioClientError(
    'backend_unavailable',
    error.code === 'timeout' ? 'Voice service took too long to respond.' : 'Voice service could not be reached.',
  );
}

function mapAudioHttpError(status: number, payload: unknown): EpisodeAudioClientError {
  const code = isRecord(payload) && typeof payload.error === 'string' ? payload.error : '';
  if (status === 401) return new EpisodeAudioClientError('auth_required', 'Your session expired. Sign in again.');
  if (status === 404 || code === 'not_found') return new EpisodeAudioClientError('not_found', 'Voice audio was not found for this story.');
  if (status === 429 || code === 'quota_exceeded') return new EpisodeAudioClientError('quota_exceeded', 'Today’s fresh voice allowance is exhausted.');
  if (code === 'queue_unavailable') return new EpisodeAudioClientError('queue_unavailable', 'Voice generation could not be queued.');
  if (code === 'audio_unavailable') return new EpisodeAudioClientError('audio_unavailable', 'Generated voice audio is temporarily unavailable.');
  return new EpisodeAudioClientError('backend_unavailable', 'Voice service could not complete the request.');
}

function invalidResponse(): EpisodeAudioClientError {
  return new EpisodeAudioClientError('backend_unavailable', 'Voice service returned an invalid response.');
}

function isStatus(value: unknown): value is EpisodeAudioStatus {
  return value === 'reserving' || value === 'queued' || value === 'processing' || value === 'staged' || value === 'ready' || value === 'failed';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
