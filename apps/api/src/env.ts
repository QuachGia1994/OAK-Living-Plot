export interface AppEnv {
  DB: D1Database;
  CLERK_PUBLISHABLE_KEY: string;
  CLERK_JWT_KEY: string;
  CLERK_AUTHORIZED_PARTIES: string;
  GEMINI_API_KEY: string;
}
