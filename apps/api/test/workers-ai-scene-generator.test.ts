import { describe, expect, it, vi } from 'vitest';
import type { CreativeSceneProposal } from '../src/ai/creative-scene-schema';
import type { GenerationTelemetrySink } from '../src/telemetry/contracts';
import { WORKERS_AI_SCENE_MODEL, WorkersAiSceneGenerator } from '../src/ai/workers-ai-scene-generator';
import { makeGenerationInput, makeValidProposal } from './drama-fixtures';

function creativeProposal(): CreativeSceneProposal {
  const proposal = makeValidProposal();
  return {
    title: proposal.title,
    script: proposal.script,
    summary: proposal.summary,
    beat: proposal.beat as CreativeSceneProposal['beat'],
    pacingRole: proposal.pacingRole as CreativeSceneProposal['pacingRole'],
    establishedFacts: proposal.establishedFacts,
    threadsToOpen: proposal.threadChanges.open,
    threadTitlesToResolve: ['Linh nghi ngờ sự thành thật của An.'],
    choices: proposal.choices.map((choice, index) => ({
      key: choice.key,
      label: choice.label,
      intent: choice.intent,
      consequence: choice.consequence,
      durableFact: [
        'An và Linh quyết định cùng đối chất người gửi tin.',
        'Linh cảm thấy an toàn hơn sau khi An giao chiếc điện thoại đi xử lý.',
        'An và Linh rời căn hộ bằng lối thoát phía sau.',
      ][index]!,
      factTextsToResolve: [],
      threadTitlesToResolve: [],
      threadsToOpen: [],
      nextTone: choice.stateDelta.nextTone,
    })).slice(0, 3) as unknown as CreativeSceneProposal['choices'],
  };
}

describe('WorkersAiSceneGenerator', () => {
  it('uses one primary creative call on the happy path', async () => {
    const run = vi.fn().mockResolvedValue({
      response: creativeProposal(),
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
    expect(request).toMatchObject({ response_format: { type: 'json_schema' }, max_tokens: 2300, temperature: 0.45 });
    const responseFormat = request.response_format as { json_schema: Record<string, unknown> };
    expect(responseFormat.json_schema.type).toBe('object');
    const schemaText = JSON.stringify(responseFormat.json_schema);
    expect(schemaText).toContain('durableFact');
    expect(schemaText).not.toContain('stateDelta');
    expect(schemaText).not.toContain('affinityDelta');
    const messages = request.messages as Array<{ role: string; content: string }>;
    expect(messages[0].content).toContain('creative scene writer');
    expect(messages[0].content).toContain('durableFact');
    expect(messages[1].content).toContain('DRAMA_CONTEXT_JSON');
  });

  it('uses a second full creative call only when the first response cannot be parsed', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ response: { title: 'broken' }, usage: { prompt_tokens: 10, completion_tokens: 5 } })
      .mockResolvedValueOnce({ response: creativeProposal(), usage: { prompt_tokens: 20, completion_tokens: 15 } });
    const generator = new WorkersAiSceneGenerator({ run } as unknown as Ai);

    const result = await generator.generate(makeGenerationInput());

    expect(run).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ ok: true, value: { attempts: 2, usage: { inputTokens: 30, outputTokens: 20 } } });
    const second = run.mock.calls[1][1] as { max_tokens: number; messages: Array<{ content: string }> };
    expect(second.max_tokens).toBe(2300);
    expect(second.messages[0].content).toContain('prior draft was rejected');
  });

  it('accepts a structurally valid creative draft without a second call for novelty-only publication scores', async () => {
    const input = makeGenerationInput();
    input.recentHistory = [
      { sceneNumber: 1, title: 'Một', summary: 'Một biến cố cũ.', committedChoice: 'Đi tiếp', choiceIntent: 'tiếp cận', consequence: 'Cửa đã mở.', choiceLabels: ['Đi', 'Dừng', 'Chờ'], beat: 'revelation' },
      { sceneNumber: 2, title: 'Hai', summary: 'Một biến cố khác.', committedChoice: 'Rẽ trái', choiceIntent: 'né tránh', consequence: 'Lối cũ bị khóa.', choiceLabels: ['Trái', 'Phải', 'Lùi'], beat: 'dilemma' },
      { sceneNumber: 3, title: 'Ba', summary: 'Tình thế chuyển hướng.', committedChoice: 'Chạy', choiceIntent: 'thoát thân', consequence: 'Họ đến căn hộ.', choiceLabels: ['Chạy', 'Ẩn', 'Gọi'], beat: 'pursuit' },
    ];
    input.novelty = { excludedBeats: ['revelation', 'dilemma', 'pursuit'], trajectoryConstraints: [], motifHistory: [] };
    const recycled = creativeProposal();
    recycled.beat = 'revelation';
    const run = vi.fn().mockResolvedValue({ response: recycled, usage: { prompt_tokens: 10, completion_tokens: 5 } });
    const generator = new WorkersAiSceneGenerator({ run } as unknown as Ai);

    const result = await generator.generate(input);

    expect(result).toMatchObject({ ok: true, value: { attempts: 1 } });
    expect(run).toHaveBeenCalledTimes(1);
    if (result.ok) expect(result.value.proposal.beat).toBe('revelation');
  });

  it('canonicalizes only exact natural-language resolution hints and never creates relationship deltas', async () => {
    const creative = creativeProposal();
    creative.choices[0].factTextsToResolve = ['An cố tình giấu một tin nhắn khỏi Linh.'];
    creative.choices[0].threadTitlesToResolve = ['Linh nghi ngờ sự thành thật của An.'];
    const run = vi.fn().mockResolvedValue({ response: creative, usage: { prompt_tokens: 100, completion_tokens: 100 } });
    const generator = new WorkersAiSceneGenerator({ run } as unknown as Ai);

    const result = await generator.generate(makeGenerationInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.proposal.choices[0].stateDelta.factKeysToResolve).toEqual(['fact-hidden-message']);
    expect(result.value.proposal.choices[0].stateDelta.threadKeysToResolve).toEqual(['thread-trust']);
    expect(result.value.proposal.choices.every((choice) => choice.stateDelta.relationships.length === 0)).toBe(true);
  });

  it('keeps a one-character story durable with provider-authored branch facts', async () => {
    const input = makeGenerationInput();
    input.characters = [input.characters[0]!];
    input.relationships = [];
    const run = vi.fn().mockResolvedValue({ response: creativeProposal(), usage: { prompt_tokens: 10, completion_tokens: 5 } });
    const generator = new WorkersAiSceneGenerator({ run } as unknown as Ai);

    const result = await generator.generate(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.proposal.choices.every((choice) => choice.stateDelta.relationships.length === 0)).toBe(true);
    expect(result.value.proposal.choices.every((choice) => choice.stateDelta.factsToAdd.length === 1)).toBe(true);
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

  it('returns invalid_response only when creative parse still fails after one controlled retry', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ response: { title: 'broken' }, usage: { prompt_tokens: 10, completion_tokens: 5 } })
      .mockResolvedValueOnce({ response: { title: 'still-broken' }, usage: { prompt_tokens: 10, completion_tokens: 5 } });
    const generator = new WorkersAiSceneGenerator({ run } as unknown as Ai);

    const result = await generator.generate(makeGenerationInput());

    expect(run).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid_response', attempts: 2 } });
  });

  it('emits privacy-safe pipeline timings and provider-call counts', async () => {
    const telemetry: GenerationTelemetrySink = {
      recordGenerationAttempt: vi.fn(),
      recordGenerationPipeline: vi.fn(),
    };
    const run = vi.fn().mockResolvedValue({ response: creativeProposal(), usage: { prompt_tokens: 10, completion_tokens: 5 } });
    const generator = new WorkersAiSceneGenerator({ run } as unknown as Ai, telemetry);

    await generator.generate(makeGenerationInput());

    expect(telemetry.recordGenerationPipeline).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'workers-ai',
      model: WORKERS_AI_SCENE_MODEL,
      providerCalls: 1,
      repairs: 0,
      outcome: 'accepted',
      timings: expect.objectContaining({
        providerMs: expect.any(Number),
        parseMs: expect.any(Number),
        compileMs: expect.any(Number),
        validateMs: expect.any(Number),
        totalMs: expect.any(Number),
      }),
    }));
  });
});
