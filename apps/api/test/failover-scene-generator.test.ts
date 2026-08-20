import { describe, expect, it, vi } from 'vitest';
import type { SceneGenerator } from '../src/ai/contracts';
import { FailoverSceneGenerator } from '../src/ai/failover-scene-generator';
import { makeGenerationInput, makeValidProposal } from './drama-fixtures';

function success(provider: string) {
  return {
    ok: true as const,
    value: {
      proposal: makeValidProposal(),
      usage: { inputTokens: 1, outputTokens: 1 },
      attempts: 1,
      provider,
      model: `${provider}-model`,
    },
  };
}

describe('FailoverSceneGenerator', () => {
  it('falls back after the primary exhausts structured validation', async () => {
    const primaryGenerate = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'invalid_response', message: 'invalid proposal', attempts: 2 },
    });
    const fallbackGenerate = vi.fn().mockResolvedValue(success('fallback'));
    const generator = new FailoverSceneGenerator(
      { generate: primaryGenerate } as SceneGenerator,
      { generate: fallbackGenerate } as SceneGenerator,
    );

    await expect(generator.generate(makeGenerationInput())).resolves.toMatchObject({
      ok: true,
      value: { provider: 'fallback' },
    });
    expect(primaryGenerate).toHaveBeenCalledTimes(1);
    expect(fallbackGenerate).toHaveBeenCalledTimes(1);
  });

  it('falls back when the primary provider is unavailable', async () => {
    const primaryGenerate = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'provider_unavailable', message: 'primary down', retryable: true },
    });
    const fallbackGenerate = vi.fn().mockResolvedValue(success('fallback'));
    const generator = new FailoverSceneGenerator(
      { generate: primaryGenerate } as SceneGenerator,
      { generate: fallbackGenerate } as SceneGenerator,
    );

    await expect(generator.generate(makeGenerationInput())).resolves.toMatchObject({
      ok: true,
      value: { provider: 'fallback' },
    });
    expect(fallbackGenerate).toHaveBeenCalledTimes(1);
  });

  it('does not fan out invalid canonical input to another provider', async () => {
    const invalid = {
      ok: false as const,
      error: { code: 'invalid_input' as const, message: 'bad canonical input' },
    };
    const primaryGenerate = vi.fn().mockResolvedValue(invalid);
    const fallbackGenerate = vi.fn().mockResolvedValue(success('fallback'));
    const generator = new FailoverSceneGenerator(
      { generate: primaryGenerate } as SceneGenerator,
      { generate: fallbackGenerate } as SceneGenerator,
    );

    await expect(generator.generate(makeGenerationInput())).resolves.toEqual(invalid);
    expect(fallbackGenerate).not.toHaveBeenCalled();
  });

  it('keeps the fallback cold when the primary succeeds', async () => {
    const primaryGenerate = vi.fn().mockResolvedValue(success('primary'));
    const fallbackGenerate = vi.fn().mockResolvedValue(success('fallback'));
    const generator = new FailoverSceneGenerator(
      { generate: primaryGenerate } as SceneGenerator,
      { generate: fallbackGenerate } as SceneGenerator,
    );

    await expect(generator.generate(makeGenerationInput())).resolves.toMatchObject({
      ok: true,
      value: { provider: 'primary' },
    });
    expect(fallbackGenerate).not.toHaveBeenCalled();
  });
});
