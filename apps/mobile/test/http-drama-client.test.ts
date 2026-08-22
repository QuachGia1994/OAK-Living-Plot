import { describe, expect, it, vi } from 'vitest';
import { DramaClientError } from '../src/features/drama/contracts';
import { HttpDramaExperienceClient } from '../src/features/drama/http-client';

describe('HttpDramaExperienceClient', () => {
  it('uses fresh bearer tokens and preserves caller creation idempotency', async () => {
    const tokens = ['token-one', 'token-two'];
    const getToken = vi.fn(async () => tokens.shift() ?? null);
    const fetcher = vi.fn<TestFetch>(async (_input, init) => {
      if (init?.method === 'POST') return Response.json({ drama: dramaPayload() }, { status: 201 });
      return Response.json({ drama: dramaPayload() });
    });
    const client = new HttpDramaExperienceClient('https://api.living-plot.test/', getToken, fetcher, 'vi-VN');

    await client.createDrama(
      { premise: 'Một tin nhắn bí ẩn khiến Mina phải chọn người cô có thể tin.', mood: 'mysterious', characterName: 'Mina' },
      'creation-stable-001',
    );
    await client.loadDrama('drama-1');

    expect(getToken).toHaveBeenCalledTimes(2);
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer token-one');
    expect(new Headers(fetcher.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer token-two');
    expect(String(fetcher.mock.calls[0][0])).toBe('https://api.living-plot.test/v1/dramas');
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ creationKey: 'creation-stable-001', locale: 'vi-VN', characterName: 'Mina' });
    expect(typeof body.generationKey).toBe('string');
  });

  it('allows slow AI mutations beyond 60 seconds without aborting the canonical request', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn<TestFetch>(async (_input, init) => new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(() => resolve(Response.json({ drama: dramaPayload() }, { status: 201 })), 90_000);
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('aborted'));
        });
      }));
      const client = new HttpDramaExperienceClient('https://api.test', async () => 'token', fetcher);

      const pending = client.createDrama(
        { premise: 'Mina receives an impossible message and must decide whom to trust tonight.', mood: 'mysterious', characterName: 'Mina' },
        'creation-slow-001',
      );
      await vi.advanceTimersByTimeAsync(90_000);

      await expect(pending).resolves.toMatchObject({ id: 'drama-1' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('reuses the continuation generation key after a lost response', async () => {
    const bodies: Record<string, unknown>[] = [];
    let attempt = 0;
    const fetcher = vi.fn<TestFetch>(async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      attempt += 1;
      if (attempt === 1) throw new Error('response lost');
      return Response.json({ drama: dramaPayload() });
    });
    const client = new HttpDramaExperienceClient('https://api.test', async () => 'token', fetcher);

    await expect(client.requestNextScene('drama-1')).rejects.toMatchObject({ code: 'backend_unavailable' });
    await expect(client.requestNextScene('drama-1')).resolves.toMatchObject({ id: 'drama-1' });
    expect(bodies[0].generationKey).toBe(bodies[1].generationKey);
  });

  it('resyncs canonical drama after a choice conflict', async () => {
    const responses = [
      Response.json({ error: 'choice_conflict' }, { status: 409 }),
      Response.json({ drama: dramaPayload({ committedChoiceId: 'choice-b' }) }),
    ];
    const client = new HttpDramaExperienceClient('https://api.test', async () => 'token', async () => responses.shift()!);

    const drama = await client.commitChoice('drama-1', 'scene-1', 'choice-a');
    expect(drama.currentScene.branch).toEqual({ state: 'committed', choiceId: 'choice-b', consequence: 'Canonical consequence.' });
  });

  it('normalizes persisted history vocabulary to scene and branch semantics', async () => {
    const now = Date.parse('2026-08-17T01:00:00.000Z');
    const calls: { url: string; method: string }[] = [];
    const fetcher = vi.fn<TestFetch>(async (input, init) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? 'GET' });
      if (url.endsWith('/v1/dramas/library')) return Response.json({ library: { active: [summaryPayload(now)], archived: [] } });
      if (url.endsWith('/history')) {
        return Response.json({ history: {
          dramaId: 'drama-1',
          title: 'The Message',
          items: [
            { sceneId: 'scene-1', sceneNumber: 1, title: 'First turn', summary: 'Mina chose.', branchState: 'committed', choiceKey: 'A', choiceLabel: 'Tell the truth', consequence: 'Trust changes.' },
            { sceneId: 'scene-2', sceneNumber: 2, title: 'Second turn', summary: 'A new problem appears.', branchState: 'open' },
          ],
        } });
      }
      return Response.json({ dramaSummary: summaryPayload(now) });
    });
    const client = new HttpDramaExperienceClient('https://api.test', async () => 'token', fetcher, 'en-US', 'en', () => now);

    const library = await client.loadLibrary();
    const history = await client.loadHistory('drama-1');
    const archived = await client.archiveDrama('drama-1');
    const restored = await client.restoreDrama('drama-1');

    expect(library.active[0]).toMatchObject({ id: 'drama-1', updatedLabel: 'Just now' });
    expect(history).toMatchObject({ dramaId: 'drama-1' });
    expect(history.items[0]).toMatchObject({ sceneId: 'scene-1', sceneNumber: 1, branchState: 'committed', choiceKey: 'A', consequence: 'Trust changes.' });
    expect(archived.id).toBe('drama-1');
    expect(restored.id).toBe('drama-1');
    expect(calls.at(-2)?.url).toContain('/archive');
    expect(calls.at(-1)?.url).toContain('/restore');
  });

  it('rejects malformed branch state rather than manufacturing client canonical state', async () => {
    const malformed = dramaPayload();
    malformed.currentScene.branch = { state: 'committed' } as never;
    const client = new HttpDramaExperienceClient('https://api.test', async () => 'token', async () => Response.json({ drama: malformed }));

    await expect(client.loadDrama('drama-1')).rejects.toEqual(
      new DramaClientError('backend_unavailable', 'The Living Plot server returned an invalid response.'),
    );
  });

  it('localizes live home metadata from uiLocale without changing dramaLocale', async () => {
    const now = Date.parse('2026-08-17T01:00:00.000Z');
    const client = new HttpDramaExperienceClient(
      'https://api.test',
      async () => 'token',
      async () => Response.json({ home: {
        recentDramas: [summaryPayload(now - 3_600_000)],
        quota: { enforced: true, textEnforced: false, voiceEnforced: true, textRemaining: 49, textLimit: 50, voiceRemaining: 1, voiceLimit: 1, voiceBonusCredits: 0, resetAt: '2026-08-18T00:00:00.000Z' },
        retention: {
          currentStreakDays: 1,
          choicesMade: 2,
          activeDramas: 1,
          dailyPrompt: { label: 'Mầm drama', premise: 'Một tình huống drama đủ chi tiết để dùng làm mầm tạo mới.', mood: 'tense', characterName: 'Lan' },
        },
      } }),
      'vi-VN',
      'vi',
      () => now,
    );

    const home = await client.loadHome();

    expect(home.recentDramas[0].updatedLabel).toBe('1 giờ trước');
    expect(home.quota).toMatchObject({ enforced: true, textEnforced: false, voiceEnforced: true });
    expect(home.quota.resetLabel).toBe('Đặt lại lúc 00:00 UTC');
  });

  it('accepts older home quota projections without optional preview/bonus fields', async () => {
    const now = Date.parse('2026-08-17T01:00:00.000Z');
    const client = new HttpDramaExperienceClient('https://api.test', async () => 'token', async () => Response.json({ home: {
      recentDramas: [summaryPayload(now)],
      quota: { textRemaining: 49, textLimit: 50, voiceRemaining: 1, voiceLimit: 1, resetAt: '2026-08-18T00:00:00.000Z' },
      retention: { currentStreakDays: 1, choicesMade: 2, activeDramas: 1, dailyPrompt: { label: 'Daily spark', premise: 'A sufficiently specific daily drama premise appears here.', mood: 'tense', characterName: 'Mina' } },
    } }), 'en-US', 'en', () => now);

    const home = await client.loadHome();
    expect(home.quota).toMatchObject({ enforced: true, textEnforced: true, voiceEnforced: true, voiceBonusCredits: 0, textRemaining: 49, voiceRemaining: 1 });
  });

  it('parses home retention independently of canonical drama state', async () => {
    const now = Date.parse('2026-08-17T01:00:00.000Z');
    const client = new HttpDramaExperienceClient(
      'https://api.test',
      async () => 'token',
      async () => Response.json({ home: {
        recentDramas: [{ ...summaryPayload(now - 3_600_000), sceneNumber: 2 }],
        quota: { textRemaining: 49, textLimit: 50, voiceRemaining: 1, voiceLimit: 1, voiceBonusCredits: 7, resetAt: '2026-08-18T00:00:00.000Z' },
        retention: {
          currentStreakDays: 2,
          choicesMade: 5,
          activeDramas: 1,
          dailyPrompt: { label: 'Daily spark', premise: 'A sufficiently specific daily drama premise appears here.', mood: 'tense', characterName: 'Mina' },
        },
      } }),
      'en-US',
      'en',
      () => now,
    );

    const home = await client.loadHome();
    expect(home.recentDramas[0]).toMatchObject({ updatedLabel: '1h ago', sceneNumber: 2 });
    expect(home.quota).toMatchObject({ textRemaining: 49, textLimit: 50, voiceRemaining: 1, voiceLimit: 1, voiceBonusCredits: 7 });
    expect(home.retention).toMatchObject({ currentStreakDays: 2, choicesMade: 5, activeDramas: 1 });
  });
});

type TestFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function summaryPayload(updatedAt: number) {
  return {
    id: 'drama-1',
    title: 'The Message',
    premise: 'Mina receives an impossible message.',
    mood: 'mysterious',
    characterName: 'Mina',
    updatedAt,
    sceneNumber: 2,
    status: 'ready_for_next_scene',
    resumeLine: 'Mina learned who sent the message.',
  };
}

function dramaPayload(overrides: { committedChoiceId?: string } = {}) {
  return {
    id: 'drama-1',
    title: 'The Message',
    premise: 'Mina receives an impossible message.',
    mood: 'mysterious',
    leadCharacter: { id: 'character-1', name: 'Mina', role: 'protagonist' },
    currentScene: {
      id: 'scene-1',
      number: 1,
      title: 'First turn',
      script: 'A sufficiently long drama script is returned by the canonical server.',
      summary: 'Mina must choose.',
      branch: overrides.committedChoiceId
        ? { state: 'committed', choiceId: overrides.committedChoiceId, consequence: 'Canonical consequence.' }
        : { state: 'open' },
      choices: [
        { id: 'choice-a', key: 'A', label: 'Tell the truth', intent: 'confess', consequence: 'Trust changes.' },
        { id: 'choice-b', key: 'B', label: 'Investigate first', intent: 'investigate', consequence: 'A clue appears.' },
        { id: 'choice-c', key: 'C', label: 'Ask for help', intent: 'seek ally', consequence: 'An ally joins.' },
      ],
    },
  };
}
