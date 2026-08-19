import type { AudioJob } from './audio/contracts';

export interface AppEnv {
  DB: D1Database;
  TTS_QUEUE: Queue<AudioJob>;
  TTS_DLQ_NAME: string;
  AUDIO_BUCKET: R2Bucket;
  ANALYTICS: AnalyticsEngineDataset;
  CLERK_PUBLISHABLE_KEY: string;
  CLERK_JWT_KEY: string;
  CLERK_AUTHORIZED_PARTIES: string;
  GEMINI_API_KEY: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: string;
  REVENUECAT_SECRET_API_KEY: string;
  REVENUECAT_PLUS_ENTITLEMENT_ID: string;
  REVENUECAT_WEBHOOK_AUTHORIZATION: string;
  REVENUECAT_WEBHOOK_SIGNING_SECRET: string;
}
