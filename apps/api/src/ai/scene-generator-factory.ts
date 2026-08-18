import type { AppEnv } from '../env';
import { CloudflareGenerationTelemetrySink } from '../telemetry/cloudflare-generation-telemetry';
import type { SceneGenerator } from './contracts';
import { GeminiSceneGenerator } from './gemini-scene-generator';

export function createSceneGenerator(env: Pick<AppEnv, 'GEMINI_API_KEY' | 'ANALYTICS'>): SceneGenerator {
  return new GeminiSceneGenerator(
    env.GEMINI_API_KEY,
    undefined,
    undefined,
    new CloudflareGenerationTelemetrySink(env.ANALYTICS),
  );
}
