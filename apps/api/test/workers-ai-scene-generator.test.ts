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
    expect(model).toBe('@cf/meta/llama-3.3-70b-instruct-fp8-fast');
    expect(request).toMatchObject({
      response_format: { type: 'json_schema' },
      max_tokens: 4096,
      temperature: 0.35,
    });
    const responseFormat = request.response_format as { json_schema: Record<string, unknown> };
    expect(responseFormat.json_schema.type).toBe('object');
    expect(responseFormat.json_schema).not.toHaveProperty('name');
    expect(responseFormat.json_schema).not.toHaveProperty('schema');
    expect(responseFormat.json_schema).not.toHaveProperty('strict');
    const messages = request.messages as Array<{ role: string; content: string }>;
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('Living Plot interactive short-drama scene engine');
    expect(messages[0].content).toContain('nextTone alone never satisfies branch commitment');
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

  it('constrains one-character structured output to durable fact branches instead of impossible relationships', async () => {
    const input = makeGenerationInput();
    input.characters = [input.characters[0]!];
    input.relationships = [];
    const proposal = structuredClone(makeValidProposal());
    for (const choice of proposal.choices) choice.stateDelta.relationships = [];
    const run = vi.fn().mockResolvedValue({ response: proposal, usage: { prompt_tokens: 10, completion_tokens: 5 } });
    const generator = new WorkersAiSceneGenerator({ run } as unknown as Ai);

    const result = await generator.generate(input);

    expect(result.ok).toBe(true);
    const request = run.mock.calls[0][1] as {
      response_format: {
        json_schema: {
          properties: {
            choices: {
              items: {
                properties: {
                  stateDelta: {
                    properties: {
                      relationships: { maxItems: number };
                      factsToAdd: { minItems?: number };
                    };
                  };
                };
              };
            };
          };
        };
      };
    };
    const stateDelta = request.response_format.json_schema.properties.choices.items.properties.stateDelta.properties;
    expect(stateDelta.relationships.maxItems).toBe(0);
    expect(stateDelta.factsToAdd.minItems).toBe(1);
  });

  it('recovers a one-character continuation when tone-only branches fail durable commitment', async () => {
    const input = makeGenerationInput();
    input.characters = [input.characters[0]!];
    input.relationships = [];
    const toneOnly = structuredClone(makeValidProposal());
    for (const choice of toneOnly.choices) {
      choice.stateDelta.factsToAdd = [];
      choice.stateDelta.factKeysToResolve = [];
      choice.stateDelta.threadsToOpen = [];
      choice.stateDelta.threadKeysToResolve = [];
    }
    const repaired = structuredClone(makeValidProposal());
    const run = vi
      .fn()
      .mockResolvedValueOnce({ response: toneOnly, usage: { prompt_tokens: 10, completion_tokens: 5 } })
      .mockResolvedValueOnce({ response: repaired, usage: { prompt_tokens: 20, completion_tokens: 15 } });
    const generator = new WorkersAiSceneGenerator({ run } as unknown as Ai);

    const result = await generator.generate(input);

    expect(run).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ ok: true, value: { attempts: 2 } });
    const secondRequest = run.mock.calls[1][1] as { messages: Array<{ role: string; content: string }> };
    expect(secondRequest.messages[0].content).toContain('only one character');
    expect(secondRequest.messages[0].content).toContain('factsToAdd');
    expect(secondRequest.messages[0].content).toContain('BRANCH_NO_DURABLE_EFFECT');
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

  it('retries once on Phase-2 objective branch commitment failure then accepts valid proposal', async () => {
    const weak = structuredClone(makeValidProposal());
    for (const choice of weak.choices) {
      choice.stateDelta.relationships = [];
      choice.stateDelta.factsToAdd = [];
      choice.stateDelta.factKeysToResolve = [];
      choice.stateDelta.threadsToOpen = [];
      choice.stateDelta.threadKeysToResolve = [];
      choice.stateDelta.nextTone = '';
    }
    const run = vi
      .fn()
      .mockResolvedValueOnce({ response: weak, usage: { prompt_tokens: 10, completion_tokens: 5 } })
      .mockResolvedValueOnce({ response: makeValidProposal(), usage: { prompt_tokens: 20, completion_tokens: 15 } });
    const generator = new WorkersAiSceneGenerator({ run } as unknown as Ai);

    const result = await generator.generate(makeGenerationInput());

    expect(run).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ ok: true, value: { attempts: 2 } });
  });

  it('returns invalid_response after two Phase-2 objective rejections', async () => {
    const weak = structuredClone(makeValidProposal());
    for (const choice of weak.choices) {
      choice.stateDelta.relationships = [];
      choice.stateDelta.factsToAdd = [];
      choice.stateDelta.factKeysToResolve = [];
      choice.stateDelta.threadsToOpen = [];
      choice.stateDelta.threadKeysToResolve = [];
      choice.stateDelta.nextTone = '';
    }
    const run = vi.fn().mockResolvedValue({ response: weak, usage: { prompt_tokens: 10, completion_tokens: 5 } });
    const generator = new WorkersAiSceneGenerator({ run } as unknown as Ai);

    const result = await generator.generate(makeGenerationInput());

    expect(run).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid_response', attempts: 2 } });
  });

  it('retries on Phase-1 excluded beat then accepts a different beat', async () => {
    const input = makeGenerationInput();
    input.recentHistory = [
      { sceneNumber: 1, title: 'a', summary: 's', committedChoice: 'A', choiceIntent: 'x', consequence: 'y', choiceLabels: ['A', 'B', 'C'], beat: 'revelation' },
      { sceneNumber: 2, title: 'b', summary: 's', committedChoice: 'A', choiceIntent: 'x', consequence: 'y', choiceLabels: ['A', 'B', 'C'], beat: 'dilemma' },
      { sceneNumber: 3, title: 'c', summary: 's', committedChoice: 'A', choiceIntent: 'x', consequence: 'y', choiceLabels: ['A', 'B', 'C'], beat: 'pursuit' },
    ];
    const recycled = structuredClone(makeValidProposal());
    recycled.beat = 'revelation';
    const fixed = structuredClone(makeValidProposal());
    fixed.beat = 'alliance';
    const run = vi
      .fn()
      .mockResolvedValueOnce({ response: recycled, usage: { prompt_tokens: 10, completion_tokens: 5 } })
      .mockResolvedValueOnce({ response: fixed, usage: { prompt_tokens: 20, completion_tokens: 15 } });
    const generator = new WorkersAiSceneGenerator({ run } as unknown as Ai);

    const result = await generator.generate(input);

    expect(run).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ ok: true, value: { attempts: 2 } });
    if (result.ok) expect(result.value.proposal.beat).toBe('alliance');
  });
});
