import type { MediaAsset } from '@/features/drama/domain';

export interface SceneVoicePlaybackSource {
  uri: string;
  headers: Record<string, string>;
}

export interface SceneVoiceClient {
  readonly configured: boolean;
  request(sceneId: string, voiceVariant: string, reservationKey: string): Promise<MediaAsset>;
  loadStatus(assetId: string): Promise<MediaAsset>;
  playbackSource(assetId: string): Promise<SceneVoicePlaybackSource>;
}

export type SceneVoiceErrorCode =
  | 'auth_required'
  | 'not_found'
  | 'quota_exceeded'
  | 'queue_unavailable'
  | 'audio_unavailable'
  | 'backend_unavailable'
  | 'not_configured';

export class SceneVoiceClientError extends Error {
  constructor(
    public readonly code: SceneVoiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SceneVoiceClientError';
  }
}
