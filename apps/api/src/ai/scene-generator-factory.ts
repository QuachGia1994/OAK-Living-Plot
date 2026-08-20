import type { AppEnv } from '../env';
import { CloudflareGenerationTelemetrySink } from '../telemetry/cloudflare-generation-telemetry';
import type { SceneGenerator } from './contracts';
import { FailoverSceneGenerator } from './failover-scene-generator';
import { GeminiSceneGenerator } from './gemini-scene-generator';
import { WorkersAiSceneGenerator } from './workers-ai-scene-generator';

export function createSceneGenerator(env: Pick<AppEnv, 'AI' | 'GEMINI_API_KEY' | 'ANALYTICS'>): SceneGenerator {
  const telemetry = new CloudflareGenerationTelemetrySink(env.ANALYTICS);
  const gemini = new GeminiSceneGenerator(env.GEMINI_API_KEY, undefined, undefined, telemetry);
  if (!env.AI) return gemini;

  const workersAi = new WorkersAiSceneGenerator(env.AI, telemetry);
  return env.GEMINI_API_KEY.trim()
    ? new FailoverSceneGenerator(workersAi, gemini)
    : workersAi;
}
