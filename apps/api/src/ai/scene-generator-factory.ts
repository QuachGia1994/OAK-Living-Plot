import type { AppEnv } from '../env';
import { CloudflareGenerationTelemetrySink } from '../telemetry/cloudflare-generation-telemetry';
import type { SceneGenerator } from './contracts';
import { GeminiSceneGenerator } from './gemini-scene-generator';
import { WorkersAiSceneGenerator } from './workers-ai-scene-generator';

export function createSceneGenerator(env: Pick<AppEnv, 'AI' | 'GEMINI_API_KEY' | 'ANALYTICS'>): SceneGenerator {
  const telemetry = new CloudflareGenerationTelemetrySink(env.ANALYTICS);
  if (env.AI) return new WorkersAiSceneGenerator(env.AI, telemetry);
  return new GeminiSceneGenerator(env.GEMINI_API_KEY, undefined, undefined, telemetry);
}
