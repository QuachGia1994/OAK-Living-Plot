import { describe, expect, it, vi } from 'vitest';
import { GeminiSceneGenerator, SCENE_MODEL } from '../src/ai/gemini-scene-generator';
import { makeGenerationInput, makeValidProposal } from './drama-fixtures';

describe('GeminiSceneGenerator', () => {
  it('sends a structured-output request without leaking the API key into the body', async () => {
    const fetcher = vi.fn<TestFetch>(async () => Response.json(geminiResponse(JSON.stringify(makeValidProposal()), 120, 80)));
    const generator = new GeminiSceneGenerator('test-api-key', fetcher);

    const result = await generator.generate(makeGenerationInput());

    expect(result.ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toContain('/v1beta/interactions');
    expect(new Headers(init?.headers).get('x-goog-api-key')).toBe('test-api-key');
    const body = JSON.parse(String(init?.body)) as GeminiRequestBody;
    expect(body.model).toBe('gemini-3.5-flash-lite');
    expect(body.generation_config.thinking_level).toBe('minimal');
    expect(body.response_format.type).toBe('text');
    expect(body.response_format.mime_type).toBe('application/json');
    expect(body.response_format.schema.properties.choices.minItems).toBe(3);
    expect(body.response_format.schema.properties.choices.maxItems).toBe(3);
    expect(body.store).toBe(false);
    expect(String(init?.body)).not.toContain('test-api-key');
  });

  it('retries exactly once for an invalid structured proposal and sums usage', async () => {
    const valid = JSON.stringify(makeValidProposal());
    const fetcher = vi
      .fn<TestFetch>()
      .mockResolvedValueOnce(Response.json(geminiResponse('{"title":"broken"}', 50, 10)))
      .mockResolvedValueOnce(Response.json(geminiResponse(valid, 60, 40)));
    const generator = new GeminiSceneGenerator('test-api-key', fetcher);

    const result = await generator.generate(makeGenerationInput());

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      ok: true,
      value: { attempts: 2, usage: { inputTokens: 110, outputTokens: 50 }, provider: 'gemini', model: SCENE_MODEL },
    });
    const secondBody = JSON.parse(String(fetcher.mock.calls[1][1]?.body)) as GeminiRequestBody;
    expect(secondBody.system_instruction).toContain('previous proposal was rejected');
  });

  it('does not retry provider HTTP failures', async () => {
    const fetcher = vi.fn<TestFetch>(async () => new Response('provider down', { status: 503 }));
    const generator = new GeminiSceneGenerator('test-api-key', fetcher);

    const result = await generator.generate(makeGenerationInput());

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: false,
      error: { code: 'provider_unavailable', message: 'Scene provider rejected the request.', retryable: true },
    });
  });

  it('rejects invalid input before making a provider request', async () => {
    const fetcher = vi.fn<TestFetch>();
    const generator = new GeminiSceneGenerator('test-api-key', fetcher);
    const input = makeGenerationInput();
    input.characters = [];

    const result = await generator.generate(input);

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_input');
  });

  it('stops after the second invalid structured response', async () => {
    const fetcher = vi.fn<TestFetch>(async () => Response.json(geminiResponse('{}', 20, 5)));
    const generator = new GeminiSceneGenerator('test-api-key', fetcher);

    const result = await generator.generate(makeGenerationInput());

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'invalid_response',
        message: 'Scene provider returned an invalid structured proposal after one controlled retry.',
        attempts: 2,
      },
    });
  });
});

type TestFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface GeminiRequestBody {
  model: string;
  input: string;
  system_instruction: string;
  store: boolean;
  generation_config: { thinking_level: string };
  response_format: {
    type: string;
    mime_type: string;
    schema: { properties: { choices: { minItems: number; maxItems: number } } };
  };
}

function geminiResponse(text: string, inputTokens: number, outputTokens: number) {
  return {
    status: 'completed',
    steps: [{ type: 'model_output', content: [{ type: 'text', text }] }],
    usage: { total_input_tokens: inputTokens, total_output_tokens: outputTokens },
  };
}
