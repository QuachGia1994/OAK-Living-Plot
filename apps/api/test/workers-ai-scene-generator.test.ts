import { describe, expect, it, vi } from 'vitest';
import { WORKERS_AI_SCENE_MODEL, WorkersAiSceneGenerator } from '../src/ai/workers-ai-scene-generator';
import { makeGenerationInput, makeValidProposal } from './drama-fixtures';

describe('WorkersAiSceneGenerator', () => {
  it('requests structured JSON from the free-plan Workers AI scene model', async () => {
    const run = vi.fn().mockResolvedValue({
      response: makeValidProposal(),
      usage: { prompt_tokens: 120, completion_tokens: 80 },
    });
    const generator = new WorkersAiSceneGenerator({ run } as unknown as Ai);

    const result = await generator.generate(makeGenerationInput());

    expect(result).toMatchObject({
      ok: true,
      value: {
        attempts: 1,
        provider: 'workers-ai',
        model: WORKERS_AI_SCENE_MODEL,
        usage: { inputTokens: 120, outputTokens: 80 },
      },
    });
    expect(run).toHaveBeenCalledTimes(1);
    const [model, request] = run.mock.calls[0] as [string, Record<string, unknown>];
    expect(model).toBe('@cf/meta/llama-3.1-8b-instruct-fast');
    expect(request).toMatchObject({
      response_format: { type: 'json_schema' },
      max_tokens: 2400,
      temperature: 0.5,
    });
    const messages = request.messages as Array<{ role: string; content: string }>;
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('Living Plot interactive short-drama scene engine');
    expect(messages[0].content).toContain('script must be 130–180 words');
    expect(messages[1].content).toContain('DRAMA_CONTEXT_JSON');
  });

  it('retries once when server validation rejects the first structured proposal', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ response: { title: 'broken' }, usage: { prompt_tokens: 10, completion_tokens: 5 } })
      .mockResolvedValueOnce({ response: makeValidProposal(), usage: { prompt_tokens: 20, completion_tokens: 15 } });
    const generator = new WorkersAiSceneGenerator({ run } as unknown as Ai);

    const result = await generator.generate(makeGenerationInput());

    expect(run).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ ok: true, value: { attempts: 2, usage: { inputTokens: 30, outputTokens: 20 } } });
    const secondRequest = run.mock.calls[1][1] as { messages: Array<{ role: string; content: string }> };
    expect(secondRequest.messages[0].content).toContain('previous proposal was rejected');
  });

  it('drops provider references that do not exist in canonical input before validation', async () => {
    const proposal = structuredClone(makeValidProposal());
    proposal.threadChanges.resolve = ['thread-invented'];
    proposal.choices[0].stateDelta.factKeysToResolve = ['fact-invented'];
    proposal.choices[0].stateDelta.threadKeysToResolve = ['thread-invented'];
    proposal.choices[0].stateDelta.relationships = [{
      fromKey: 'hero',
      toKey: 'invented-character',
      affinityDelta: 0,
      trustDelta: 0,
      tensionDelta: 0,
      statusText: 'must be dropped',
    }];
    const run = vi.fn().mockResolvedValue({ response: proposal, usage: { prompt_tokens: 100, completion_tokens: 100 } });
    const generator = new WorkersAiSceneGenerator({ run } as unknown as Ai);

    const result = await generator.generate(makeGenerationInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.proposal.threadChanges.resolve).toEqual([]);
    expect(result.value.proposal.choices[0].stateDelta.factKeysToResolve).toEqual([]);
    expect(result.value.proposal.choices[0].stateDelta.threadKeysToResolve).toEqual([]);
    expect(result.value.proposal.choices[0].stateDelta.relationships).toEqual([]);
  });

  it('normalizes binding failures without exposing provider internals', async () => {
    const run = vi.fn().mockRejectedValue(new Error('provider internal details'));
    const generator = new WorkersAiSceneGenerator({ run } as unknown as Ai);

    const result = await generator.generate(makeGenerationInput());

    expect(result).toEqual({
      ok: false,
      error: { code: 'provider_unavailable', message: 'Scene provider request failed.', retryable: true },
    });
  });
});
