import { describe, expect, it } from 'vitest';
import { createSceneGenerator } from '../src/ai/scene-generator-factory';
import { GeminiSceneGenerator } from '../src/ai/gemini-scene-generator';
import { WorkersAiSceneGenerator } from '../src/ai/workers-ai-scene-generator';

describe('createSceneGenerator', () => {
  it('keeps Workers AI authoritative when the AI binding exists even if Gemini is configured', () => {
    const generator = createSceneGenerator({
      AI: { run: async () => ({}) } as unknown as Ai,
      GEMINI_API_KEY: 'configured-but-not-routable-from-worker-region',
      ANALYTICS: undefined,
    });

    expect(generator).toBeInstanceOf(WorkersAiSceneGenerator);
  });

  it('uses Gemini only when the Workers AI binding is absent', () => {
    const generator = createSceneGenerator({
      AI: undefined,
      GEMINI_API_KEY: 'configured',
      ANALYTICS: undefined,
    });

    expect(generator).toBeInstanceOf(GeminiSceneGenerator);
  });
});
