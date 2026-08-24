import type { AppEnv } from '../env';
import { CloudflareGenerationTelemetrySink } from '../telemetry/cloudflare-generation-telemetry';
import type { SceneGenerator } from './contracts';
import { GeminiSceneGenerator } from './gemini-scene-generator';
import { WorkersAiSceneGenerator } from './workers-ai-scene-generator';

export type SceneGeneratorProvider = 'gemini' | 'workers_ai';

export function createSceneGenerator(
  env: Pick<AppEnv, 'AI' | 'GEMINI_API_KEY' | 'ANALYTICS' | 'SCENE_GENERATOR_PROVIDER'>,
): SceneGenerator {
  const telemetry = new CloudflareGenerationTelemetrySink(env.ANALYTICS);
  const provider = sceneGeneratorProviderFromEnv(env.SCENE_GENERATOR_PROVIDER);
  if (provider === 'gemini') return new GeminiSceneGenerator(env.GEMINI_API_KEY, undefined, undefined, telemetry);
  if (!env.AI) throw new Error('Workers AI Scene generation is configured but the AI binding is missing.');
  return new WorkersAiSceneGenerator(env.AI, telemetry);
}

export function sceneGeneratorProviderFromEnv(value: string | undefined): SceneGeneratorProvider {
  if (!value || value === 'gemini') return 'gemini';
  if (value === 'workers_ai') return 'workers_ai';
  throw new Error(`Unsupported Scene generator provider: ${value}`);
}
