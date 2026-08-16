import type { AppEnv } from '../env';
import { CloudflareStoryTelemetrySink } from '../telemetry/cloudflare-story-telemetry';
import type { StoryGenerator } from './contracts';
import { GeminiStoryGenerator } from './gemini-story-generator';

export function createStoryGenerator(env: Pick<AppEnv, 'GEMINI_API_KEY' | 'ANALYTICS'>): StoryGenerator {
  return new GeminiStoryGenerator(
    env.GEMINI_API_KEY,
    undefined,
    undefined,
    new CloudflareStoryTelemetrySink(env.ANALYTICS),
  );
}
