import type { AppEnv } from '../env';
import { CloudflareGenerationTelemetrySink } from '../telemetry/cloudflare-generation-telemetry';
import type { SceneGenerator } from './contracts';
import { FailoverSceneGenerator } from './failover-scene-generator';
import { GeminiSceneGenerator, SCENE_FALLBACK_MODEL } from './gemini-scene-generator';
import { WorkersAiSceneGenerator } from './workers-ai-scene-generator';

export function createSceneGenerator(env: Pick<AppEnv, 'AI' | 'GEMINI_API_KEY' | 'ANALYTICS'>): SceneGenerator {
  const telemetry = new CloudflareGenerationTelemetrySink(env.ANALYTICS);
  if (!env.AI) return new GeminiSceneGenerator(env.GEMINI_API_KEY, undefined, undefined, telemetry);

  const workersAi = new WorkersAiSceneGenerator(env.AI, telemetry);
  if (!env.GEMINI_API_KEY.trim()) return workersAi;

  const geminiFallback = new GeminiSceneGenerator(
    env.GEMINI_API_KEY,
    undefined,
    25_000,
    telemetry,
    SCENE_FALLBACK_MODEL,
    'low',
  );
  return new FailoverSceneGenerator(workersAi, geminiFallback);
}
