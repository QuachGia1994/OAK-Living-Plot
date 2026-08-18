export type AudioAssetStatus = 'reserving' | 'queued' | 'processing' | 'staged' | 'ready' | 'failed';
export type MediaAssetStatus = 'queued' | 'processing' | 'ready' | 'failed';

export interface AudioJob {
  assetId: string;
}

export interface MediaAsset {
  id: string;
  sceneId: string;
  kind: 'voice';
  variant: string;
  status: MediaAssetStatus;
  attempts: number;
  failureCode: string | null;
  cached: boolean;
}

export interface AudioDeliveryAsset {
  media: MediaAsset;
  objectKey: string | null;
  persistenceStatus: AudioAssetStatus;
}

export interface AudioRequestInput {
  userId: string;
  sceneId: string;
  voiceVariant: string;
  reservationKey: string;
  tier: 'free' | 'plus';
}

export type AudioRequestError =
  | { code: 'invalid_input'; message: string }
  | { code: 'not_found'; message: string }
  | { code: 'quota_exceeded'; message: string; utcDay: string; limit: number }
  | { code: 'queue_unavailable'; message: string }
  | { code: 'persistence_error'; message: string };

export type AudioRequestResult =
  | { ok: true; value: MediaAsset }
  | { ok: false; error: AudioRequestError };

export interface AudioQueue {
  send(message: AudioJob): Promise<unknown>;
}

export type AudioProcessResult =
  | { action: 'ack'; assetId: string }
  | { action: 'retry'; assetId: string; delaySeconds: number };
