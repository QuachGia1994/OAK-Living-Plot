export type EpisodeAudioStatus = 'reserving' | 'queued' | 'processing' | 'staged' | 'ready' | 'failed';

export interface EpisodeAudioAsset {
  id: string;
  episodeId: string;
  voiceVariant: string;
  status: EpisodeAudioStatus;
  inputCharacters: number;
  attempts: number;
  cached: boolean;
  failureCode: string | null;
}

export interface EpisodeAudioPlaybackSource {
  uri: string;
  headers: Record<string, string>;
}

export interface EpisodeAudioClient {
  readonly configured: boolean;
  request(episodeId: string, voiceVariant: string, reservationKey: string): Promise<EpisodeAudioAsset>;
  loadStatus(assetId: string): Promise<EpisodeAudioAsset>;
  playbackSource(assetId: string): Promise<EpisodeAudioPlaybackSource>;
}

export type EpisodeAudioErrorCode =
  | 'auth_required'
  | 'not_found'
  | 'quota_exceeded'
  | 'queue_unavailable'
  | 'audio_unavailable'
  | 'backend_unavailable'
  | 'not_configured';

export class EpisodeAudioClientError extends Error {
  constructor(
    public readonly code: EpisodeAudioErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EpisodeAudioClientError';
  }
}
