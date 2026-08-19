import { describe, expect, it, vi } from 'vitest';
import { GeminiSceneGenerator, SCENE_MODEL } from '../src/ai/gemini-scene-generator';
import { CloudflareGenerationTelemetrySink } from '../src/telemetry/cloudflare-generation-telemetry';
import type { GenerationTelemetrySink } from '../src/telemetry/contracts';
import { makeGenerationInput, makeValidProposal } from './drama-fixtures';

describe('scene generation cost telemetry', () => {
  it('is a no-op when Analytics Engine is not provisioned', () => {
    const sink = new CloudflareGenerationTelemetrySink();
    expect(() => sink.recordGenerationAttempt({
      provider: 'gemini', model: SCENE_MODEL, attempt: 1, outcome: 'accepted', usage: { inputTokens: 1, outputTokens: 1 },
    })).not.toThrow();
  });

  it('writes only privacy-safe dimensions and exact token/cost values', () => {
    const writeDataPoint = vi.fn();
    const sink = new CloudflareGenerationTelemetrySink({ writeDataPoint });

    sink.recordGenerationAttempt({
      provider: 'gemini',
      model: SCENE_MODEL,
      attempt: 2,
      outcome: 'accepted',
      usage: { inputTokens: 120, outputTokens: 80 },
    });

    expect(writeDataPoint).toHaveBeenCalledWith({
      indexes: [SCENE_MODEL],
      blobs: [
        'scene_generation_attempt',
        'gemini',
        SCENE_MODEL,
        'accepted',
        'standard_paid',
        '2026-08-16',
      ],
      doubles: [1, 2, 120, 80, 36_000, 200_000, 236_000],
    });
    const serialized = JSON.stringify(writeDataPoint.mock.calls[0][0]);
    expect(serialized).not.toContain('premise');
    expect(serialized).not.toContain('script');
    expect(serialized).not.toContain('user');
  });

  it('records rejected and accepted provider attempts separately so retries are fully costed', async () => {
    const events: Parameters<GenerationTelemetrySink['recordGenerationAttempt']>[0][] = [];
    const telemetry: GenerationTelemetrySink = {
      recordGenerationAttempt(event) {
        events.push(event);
      },
    };
    const valid = JSON.stringify(makeValidProposal());
    const fetcher = vi
      .fn<TestFetch>()
      .mockResolvedValueOnce(Response.json(geminiResponse('{"title":"broken"}', 50, 10)))
      .mockResolvedValueOnce(Response.json(geminiResponse(valid, 60, 40)));
    const generator = new GeminiSceneGenerator('test-api-key', fetcher, 12_000, telemetry);

    const result = await generator.generate(makeGenerationInput());

    expect(result.ok).toBe(true);
    expect(events).toEqual([
      {
        provider: 'gemini',
        model: SCENE_MODEL,
        attempt: 1,
        outcome: 'rejected',
        usage: { inputTokens: 50, outputTokens: 10 },
      },
      {
        provider: 'gemini',
        model: SCENE_MODEL,
        attempt: 2,
        outcome: 'accepted',
        usage: { inputTokens: 60, outputTokens: 40 },
      },
    ]);
  });

  it('fails open when observational telemetry throws', async () => {
    const telemetry: GenerationTelemetrySink = {
      recordGenerationAttempt() {
        throw new Error('analytics unavailable');
      },
    };
    const fetcher = vi.fn<TestFetch>(async () =>
      Response.json(geminiResponse(JSON.stringify(makeValidProposal()), 120, 80)),
    );
    const generator = new GeminiSceneGenerator('test-api-key', fetcher, 12_000, telemetry);

    const result = await generator.generate(makeGenerationInput());

    expect(result.ok).toBe(true);
  });
});

type TestFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function geminiResponse(text: string, inputTokens: number, outputTokens: number) {
  return {
    status: 'completed',
    steps: [{ type: 'model_output', content: [{ type: 'text', text }] }],
    usage: { total_input_tokens: inputTokens, total_output_tokens: outputTokens },
  };
}
