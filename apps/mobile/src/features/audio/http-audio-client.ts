import type {
  EpisodeAudioAsset,
  EpisodeAudioClient,
  EpisodeAudioPlaybackSource,
  EpisodeAudioStatus,
} from './contracts';
import { EpisodeAudioClientError } from './contracts';

type TokenProvider = () => Promise<string | null>;
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class HttpEpisodeAudioClient implements EpisodeAudioClient {
  readonly configured: boolean;

  constructor(
    private readonly apiBaseUrl: string,
    private readonly tokenProvider: TokenProvider,
    private readonly fetcher: FetchLike = fetch,
  ) {
    this.configured = Boolean(apiBaseUrl.trim());
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
    const base = this.baseUrl();
    const token = await this.requireToken();
    return {
      uri: `${base}/v1/audio/${encodeURIComponent(assetId)}`,
      headers: { Authorization: `Bearer ${token}` },
    };
  }

  private async requestJson(path: string, method: string, body?: unknown): Promise<unknown> {
    const base = this.baseUrl();
    const token = await this.requireToken();
    let response: Response;
    try {
      response = await this.fetcher(`${base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new EpisodeAudioClientError('backend_unavailable', 'Voice service could not be reached.');
    }

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      if (response.ok) throw new EpisodeAudioClientError('backend_unavailable', 'Voice service returned an invalid response.');
    }
    if (!response.ok) throw mapAudioHttpError(response.status, payload);
    return payload;
  }

  private baseUrl(): string {
    const base = this.apiBaseUrl.trim().replace(/\/$/u, '');
    if (!base) throw new EpisodeAudioClientError('not_configured', 'Live voice requires the Living Plot API URL.');
    return base;
  }

  private async requireToken(): Promise<string> {
    const token = await this.tokenProvider();
    if (!token?.trim()) throw new EpisodeAudioClientError('auth_required', 'Sign in before generating or playing private voice audio.');
    return token;
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
