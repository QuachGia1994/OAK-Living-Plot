import type { MediaJob } from './audio/contracts';

export interface AppEnv {
  DB: D1Database;
  TTS_QUEUE: Queue<MediaJob>;
  TTS_DLQ_NAME: string;
  AUDIO_BUCKET: R2Bucket;
  ANALYTICS?: AnalyticsEngineDataset;
  AI?: Ai;
  CLERK_JWT_KEY: string;
  CLERK_AUTHORIZED_PARTIES: string;
  GEMINI_API_KEY: string;
  REVENUECAT_SECRET_API_KEY: string;
  REVENUECAT_PLUS_ENTITLEMENT_ID: string;
  REVENUECAT_WEBHOOK_AUTHORIZATION: string;
  REVENUECAT_WEBHOOK_SIGNING_SECRET: string;
  QUOTA_MODE?: string;
}
