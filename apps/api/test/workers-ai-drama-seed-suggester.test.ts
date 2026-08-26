import { describe, expect, it, vi } from 'vitest';
import { WorkersAiDramaSeedSuggester } from '../src/ai/workers-ai-drama-seed-suggester';
import { DRAMA_SUGGESTION_LEASE_MS, DRAMA_SUGGESTION_PIPELINE_TIMEOUT_MS } from '../src/drama-runtime/suggestion-contracts';

const input = {
  locale: 'vi-VN' as const,
  mood: 'mysterious' as const,
  characterName: 'Mina',
  inspiration: 'Một bức thư đến từ người đã biến mất.',
};

describe('WorkersAiDramaSeedSuggester', () => {
  it('uses exactly one reliable structured Workers AI call on the happy path', async () => {
    const run = vi.fn().mockResolvedValue({ response: providerBatch('Một') });
    const suggester = new WorkersAiDramaSeedSuggester({ run } as unknown as Ai);

    const result = await suggester.suggest(input);

    expect(result).toMatchObject({ ok: true, value: { providerCalls: 1, repairs: 0 } });
    expect(run).toHaveBeenCalledTimes(1);
    const [model, request, options] = run.mock.calls[0] as [string, Record<string, unknown>, { signal?: AbortSignal }];
    expect(model).toBe('@cf/meta/llama-3.3-70b-instruct-fp8-fast');
    expect(request).toMatchObject({ response_format: { type: 'json_schema' }, max_tokens: 1400, temperature: 0.5 });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    const schema = JSON.stringify((request.response_format as { json_schema: unknown }).json_schema);
    expect(schema).toContain('incitingIncident');
    expect(schema).toContain('personalStakes');
    expect(schema).toContain('decisionPressure');
    expect(schema).toContain('dramaticQuestion');
    for (const forbidden of ['script', 'choices', 'stateDelta', 'relationships', 'threads', 'canonical']) expect(schema).not.toContain(forbidden);
    const messages = request.messages as Array<{ content: string }>;
    expect(messages[0].content).toContain('Vietnamese');
    expect(messages[0].content).toContain('never scenes');
    expect(messages[1].content).toContain('Một bức thư đến từ người đã biến mất.');
    if (result.ok) {
      expect(result.value.suggestions).toHaveLength(3);
      expect(Object.keys(result.value.suggestions[0]).sort()).toEqual(['characterName', 'label', 'mood', 'premise']);
      expect(result.value.suggestions[0].premise).toContain('?');
    }
  });

  it('performs at most one bounded repair when the first provider response is malformed', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce({ response: { suggestions: [{ label: 'broken' }] } })
      .mockResolvedValueOnce({ response: providerBatch('Sửa') });
    const suggester = new WorkersAiDramaSeedSuggester({ run } as unknown as Ai);

    const result = await suggester.suggest(input);

    expect(result).toMatchObject({ ok: true, value: { providerCalls: 2, repairs: 1 } });
    expect(run).toHaveBeenCalledTimes(2);
    const repair = run.mock.calls[1][1] as { temperature: number; messages: Array<{ content: string }> };
    expect(repair.temperature).toBe(0.2);
    expect(repair.messages[0].content).toContain('Previous output failed validation');
  });

  it('rejects extra fields, reserved A/B/C labels, and materially duplicate options instead of passing raw provider output through', async () => {
    const malformed = providerBatch('Bad') as { suggestions: Array<Record<string, unknown>>; extra?: string };
    malformed.extra = 'provider metadata';
    malformed.suggestions[0].label = 'A';
    malformed.suggestions[1] = { ...malformed.suggestions[0] };
    const run = vi.fn().mockResolvedValue({ response: malformed });
    const suggester = new WorkersAiDramaSeedSuggester({ run } as unknown as Ai);

    const result = await suggester.suggest(input);

    expect(result).toMatchObject({ ok: false, error: { code: 'invalid_suggestion_response', metrics: { providerCalls: 2, repairs: 1 } } });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('normalizes provider exceptions to provider_unavailable without a full Scene fallback', async () => {
    const run = vi.fn().mockRejectedValue(new Error('Workers AI unavailable'));
    const suggester = new WorkersAiDramaSeedSuggester({ run } as unknown as Ai);

    const result = await suggester.suggest(input);

    expect(result).toMatchObject({ ok: false, error: { code: 'provider_unavailable', metrics: { providerCalls: 1, repairs: 0 } } });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('rejects a one-character provider name before it can become a public suggestion', async () => {
    const invalid = providerBatch('Short name');
    invalid.suggestions[0].characterName = 'M';
    const run = vi.fn().mockResolvedValue({ response: invalid });
    const suggester = new WorkersAiDramaSeedSuggester({ run } as unknown as Ai);

    const result = await suggester.suggest(input);

    expect(result).toMatchObject({ ok: false, error: { code: 'invalid_suggestion_response', metrics: { providerCalls: 2, repairs: 1 } } });
    const firstRequest = run.mock.calls[0][1] as { response_format: { json_schema: { properties: { suggestions: { items: { properties: { characterName: { minLength: number } } } } } } } };
    expect(firstRequest.response_format.json_schema.properties.suggestions.items.properties.characterName.minLength).toBe(2);
  });

  it('aborts a hanging primary call at the bounded pipeline deadline', async () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn(hangingRun);
      const suggester = new WorkersAiDramaSeedSuggester({ run } as unknown as Ai, Date.now, 100);
      const pending = suggester.suggest(input);
      await vi.advanceTimersByTimeAsync(100);
      await expect(pending).resolves.toMatchObject({
        ok: false,
        error: { code: 'provider_unavailable', metrics: { providerCalls: 1, repairs: 0 } },
      });
      const options = run.mock.calls[0][2] as { signal: AbortSignal };
      expect(options.signal.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses the same total deadline for a hanging repair call and never starts a third provider call', async () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn()
        .mockResolvedValueOnce({ response: { suggestions: [{ label: 'broken' }] } })
        .mockImplementationOnce(hangingRun);
      const suggester = new WorkersAiDramaSeedSuggester({ run } as unknown as Ai, Date.now, 100);
      const pending = suggester.suggest(input);
      await vi.advanceTimersByTimeAsync(100);
      await expect(pending).resolves.toMatchObject({
        ok: false,
        error: { code: 'provider_unavailable', metrics: { providerCalls: 2, repairs: 1 } },
      });
      expect(run).toHaveBeenCalledTimes(2);
      const options = run.mock.calls[1][2] as { signal: AbortSignal };
      expect(options.signal.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the server pipeline deadline below the D1 lease', () => {
    expect(DRAMA_SUGGESTION_PIPELINE_TIMEOUT_MS).toBeLessThan(DRAMA_SUGGESTION_LEASE_MS);
  });

  it('requires an explicit unanswered dramatic question in every compiled premise', async () => {
    const invalid = providerBatch('Questionless');
    invalid.suggestions[2].dramaticQuestion = 'No unanswered question here.';
    const run = vi.fn().mockResolvedValue({ response: invalid });
    const suggester = new WorkersAiDramaSeedSuggester({ run } as unknown as Ai);

    const result = await suggester.suggest(input);

    expect(result).toMatchObject({ ok: false, error: { code: 'invalid_suggestion_response' } });
    expect(run).toHaveBeenCalledTimes(2);
  });
});

function hangingRun(_model: unknown, _inputs: unknown, options?: { signal?: AbortSignal }) {
  return new Promise<never>((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
}

function providerBatch(prefix: string) {
  return {
    suggestions: [
      {
        label: `${prefix} cuộc gọi`,
        incitingIncident: 'Mina nhận cuộc gọi từ người chị đã mất tích ba năm trước.',
        personalStakes: 'Nếu trả lời công khai, bí mật gia đình từng bảo vệ Mina sẽ bị phơi bày.',
        decisionPressure: 'Cảnh sát sẽ thu chiếc điện thoại trong mười phút nên Mina phải quyết định ngay.',
        dramaticQuestion: 'Ai thực sự đang gọi từ số của người chị mất tích?',
        mood: 'mysterious',
        characterName: 'Mina',
      },
      {
        label: `${prefix} hôn ước`,
        incitingIncident: 'Mina phát hiện bạn thân đã dùng danh tính của cô để công bố một hôn ước.',
        personalStakes: 'Danh dự của Mina và tình bạn lâu năm đều có thể sụp đổ nếu lời nói dối lan rộng.',
        decisionPressure: 'Buổi lễ bắt đầu tối nay nên Mina phải chọn đối chất hay im lặng trước mọi người.',
        dramaticQuestion: 'Vì sao người bạn cần tên Mina đến mức chấp nhận mất tất cả?',
        mood: 'tense',
        characterName: 'Mina',
      },
      {
        label: `${prefix} ký ức`,
        incitingIncident: 'Mina tìm thấy ảnh tuổi thơ chụp cô cạnh một người lạ mà cả nhà phủ nhận.',
        personalStakes: 'Chứng minh người đó có thật có thể phá hỏng mối quan hệ gia đình cuối cùng cô còn tin.',
        decisionPressure: 'Căn nhà trong ảnh sẽ bị phá lúc bình minh nên Mina phải vào đó ngay.',
        dramaticQuestion: 'Điều gì đã khiến mọi người cùng đồng ý quên người lạ?',
        mood: 'hopeful',
        characterName: 'Mina',
      },
    ],
  };
}
