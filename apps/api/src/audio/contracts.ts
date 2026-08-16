export type AudioAssetStatus = 'reserving' | 'queued' | 'processing' | 'staged' | 'ready' | 'failed';

export interface AudioJob {
  assetId: string;
}

export interface AudioAssetSnapshot {
  id: string;
  episodeId: string;
  voiceVariant: string;
  provider: 'google';
  providerVoiceId: string;
  languageCode: string;
  reservationKey: string;
  objectKey: string | null;
  status: AudioAssetStatus;
  inputCharacters: number;
  attempts: number;
  failureCode: string | null;
  cached: boolean;
}

export interface AudioRequestInput {
  userId: string;
  episodeId: string;
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
  | { ok: true; value: AudioAssetSnapshot }
  | { ok: false; error: AudioRequestError };

export interface AudioQueue {
  send(message: AudioJob): Promise<unknown>;
}

export type AudioProcessResult =
  | { action: 'ack'; assetId: string }
  | { action: 'retry'; assetId: string; delaySeconds: number };
