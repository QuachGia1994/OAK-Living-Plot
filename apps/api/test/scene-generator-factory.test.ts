import { describe, expect, it } from 'vitest';
import { createSceneGenerator } from '../src/ai/scene-generator-factory';
import { GeminiSceneGenerator } from '../src/ai/gemini-scene-generator';
import { WorkersAiSceneGenerator } from '../src/ai/workers-ai-scene-generator';

describe('createSceneGenerator', () => {
  it('keeps Gemini authoritative when suggestion-capable Workers AI is also bound', () => {
    const generator = createSceneGenerator({
      AI: { run: async () => ({}) } as unknown as Ai,
      GEMINI_API_KEY: 'configured',
      ANALYTICS: undefined,
      SCENE_GENERATOR_PROVIDER: 'gemini',
    });

    expect(generator).toBeInstanceOf(GeminiSceneGenerator);
  });

  it('uses Workers AI only when explicitly configured for canonical Scene generation', () => {
    const generator = createSceneGenerator({
      AI: { run: async () => ({}) } as unknown as Ai,
      GEMINI_API_KEY: 'configured-but-unused',
      ANALYTICS: undefined,
      SCENE_GENERATOR_PROVIDER: 'workers_ai',
    });

    expect(generator).toBeInstanceOf(WorkersAiSceneGenerator);
  });

  it('fails closed when Workers AI Scene generation is selected without the AI binding', () => {
    expect(() => createSceneGenerator({
      AI: undefined,
      GEMINI_API_KEY: 'configured',
      ANALYTICS: undefined,
      SCENE_GENERATOR_PROVIDER: 'workers_ai',
    })).toThrow('AI binding is missing');
  });

  it('defaults legacy configuration to Gemini so merely adding AI cannot switch Scene providers', () => {
    const generator = createSceneGenerator({
      AI: { run: async () => ({}) } as unknown as Ai,
      GEMINI_API_KEY: 'configured',
      ANALYTICS: undefined,
      SCENE_GENERATOR_PROVIDER: undefined,
    });

    expect(generator).toBeInstanceOf(GeminiSceneGenerator);
  });

  it('fails closed on an unknown explicit Scene provider value', () => {
    expect(() => createSceneGenerator({
      AI: { run: async () => ({}) } as unknown as Ai,
      GEMINI_API_KEY: 'configured',
      ANALYTICS: undefined,
      SCENE_GENERATOR_PROVIDER: 'typo-provider',
    })).toThrow('Unsupported Scene generator provider');
  });
});
