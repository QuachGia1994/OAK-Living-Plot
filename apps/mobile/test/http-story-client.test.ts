import { describe, expect, it, vi } from 'vitest';
import { StoryClientError } from '../src/features/story/contracts';
import { HttpStoryExperienceClient } from '../src/features/story/http-client';

describe('HttpStoryExperienceClient', () => {
  it('gets a fresh bearer token for each request and keeps the supplied creation idempotency key', async () => {
    const tokens = ['token-one', 'token-two'];
    const getToken = vi.fn(async () => tokens.shift() ?? null);
    const fetcher = vi.fn<TestFetch>(async (_input, init) => {
      if (init?.method === 'POST') return Response.json({ story: storyPayload() }, { status: 201 });
      return Response.json({ story: storyPayload() });
    });
    const client = new HttpStoryExperienceClient('https://api.living-plot.test/', getToken, fetcher, 'vi-VN');

    await client.createPlot(
      { premise: 'Một tin nhắn bí ẩn khiến Mina phải chọn người cô có thể tin.', mood: 'mysterious', characterName: 'Mina' },
      'creation-stable-001',
    );
    await client.loadPlot('plot-1');

    expect(getToken).toHaveBeenCalledTimes(2);
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer token-one');
    expect(new Headers(fetcher.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer token-two');
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ creationKey: 'creation-stable-001', locale: 'vi-VN', characterName: 'Mina' });
    expect(typeof body.generationKey).toBe('string');
  });

  it('maps quota/auth/provider responses without trusting a local success state', async () => {
    const responses = [
      Response.json({ error: 'quota_exceeded' }, { status: 429 }),
      Response.json({ error: 'unauthorized' }, { status: 401 }),
      Response.json({ error: 'provider_unavailable' }, { status: 503 }),
      Response.json({ error: 'provider_unavailable' }, { status: 503 }),
    ];
    const client = new HttpStoryExperienceClient('https://api.test', async () => 'token', async () => responses.shift()!);

    await expect(client.loadHome()).rejects.toMatchObject({ code: 'quota_exceeded' });
    await expect(client.loadHome()).rejects.toMatchObject({ code: 'auth_required' });
    await expect(client.loadHome()).rejects.toMatchObject({ code: 'provider_unavailable' });
  });

  it('reuses the next-episode generation key after a network failure', async () => {
    const bodies: Record<string, unknown>[] = [];
    let attempt = 0;
    const fetcher = vi.fn<TestFetch>(async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      attempt += 1;
      if (attempt === 1) throw new Error('response lost');
      return Response.json({ story: storyPayload() });
    });
    const client = new HttpStoryExperienceClient('https://api.test', async () => 'token', fetcher);

    await expect(client.requestNextEpisode('plot-1')).rejects.toMatchObject({ code: 'backend_unavailable' });
    await expect(client.requestNextEpisode('plot-1')).resolves.toMatchObject({ id: 'plot-1' });

    expect(bodies).toHaveLength(2);
    expect(bodies[0].generationKey).toBe(bodies[1].generationKey);
  });

  it('resyncs canonical story after a choice conflict', async () => {
    const responses = [
      Response.json({ error: 'choice_conflict' }, { status: 409 }),
      Response.json({ story: storyPayload({ status: 'choice_committed', committedChoiceId: 'choice-b' }) }),
    ];
    const client = new HttpStoryExperienceClient('https://api.test', async () => 'token', async () => responses.shift()!);

    const story = await client.commitChoice('plot-1', 'episode-1', 'choice-a');

    expect(story.episode.status).toBe('choice_committed');
    expect(story.episode.committedChoiceId).toBe('choice-b');
  });

  it('parses retention and relative resume metadata from home', async () => {
    const now = Date.parse('2026-08-17T01:00:00.000Z');
    const client = new HttpStoryExperienceClient(
      'https://api.test',
      async () => 'token',
      async () => Response.json({
        home: {
          recentPlots: [{
            id: 'plot-1', title: 'The Message', premise: 'Mina receives an impossible message.', mood: 'mysterious',
            characterName: 'Mina', updatedAt: now - 3_600_000, episodeNumber: 2, status: 'ready_for_next',
            resumeLine: 'Mina learned who sent the message.',
          }],
          quota: { textRemaining: 2, textLimit: 3, voiceRemaining: 1, voiceLimit: 1, resetAt: '2026-08-18T00:00:00.000Z' },
          retention: {
            currentStreakDays: 2,
            choicesMade: 5,
            activePlots: 1,
            dailyPrompt: { label: 'Daily spark', premise: 'A sufficiently specific daily story premise appears here.', mood: 'tense', characterName: 'Mina' },
          },
        },
      }),
      'en-US',
      () => now,
    );

    const home = await client.loadHome();

    expect(home.recentPlots[0]).toMatchObject({ updatedLabel: '1h ago', resumeLine: 'Mina learned who sent the message.' });
    expect(home.retention).toMatchObject({ currentStreakDays: 2, choicesMade: 5, activePlots: 1 });
  });

  it('parses library/history and uses explicit lifecycle mutation endpoints', async () => {
    const now = Date.parse('2026-08-17T01:00:00.000Z');
    const calls: { url: string; method: string }[] = [];
    const fetcher = vi.fn<TestFetch>(async (input, init) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? 'GET' });
      if (url.endsWith('/v1/story/library')) {
        return Response.json({ library: { active: [plotSummaryPayload(now)], archived: [] } });
      }
      if (url.endsWith('/history')) {
        return Response.json({ history: {
          plotId: 'plot-1',
          title: 'The Message',
          items: [
            { episodeId: 'episode-1', episodeNumber: 1, title: 'First turn', summary: 'Mina chose.', status: 'choice_committed', choiceKey: 'A', choiceLabel: 'Tell the truth', consequence: 'Trust changes.' },
            { episodeId: 'episode-2', episodeNumber: 2, title: 'Second turn', summary: 'A new problem appears.', status: 'awaiting_choice' },
          ],
        } });
      }
      return Response.json({ plot: plotSummaryPayload(now) });
    });
    const client = new HttpStoryExperienceClient('https://api.test', async () => 'token', fetcher, 'en-US', () => now);

    const library = await client.loadLibrary();
    const history = await client.loadHistory('plot-1');
    const archived = await client.archivePlot('plot-1');
    const restored = await client.restorePlot('plot-1');

    expect(library.active[0]).toMatchObject({ id: 'plot-1', updatedLabel: 'Just now' });
    expect(history.items).toHaveLength(2);
    expect(history.items[0]).toMatchObject({ choiceKey: 'A', consequence: 'Trust changes.' });
    expect(archived.id).toBe('plot-1');
    expect(restored.id).toBe('plot-1');
    expect(calls.at(-2)?.method).toBe('POST');
    expect(calls.at(-2)?.url).toContain('/archive');
    expect(calls.at(-1)?.url).toContain('/restore');
  });

  it('rejects malformed server story data instead of creating client canonical state', async () => {
    const client = new HttpStoryExperienceClient(
      'https://api.test',
      async () => 'token',
      async () => Response.json({ story: { id: 'plot-1', episode: { choices: [] } } }),
    );

    await expect(client.loadPlot('plot-1')).rejects.toEqual(
      new StoryClientError('backend_unavailable', 'The Living Plot server returned an invalid response.'),
    );
  });
});

type TestFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function plotSummaryPayload(updatedAt: number) {
  return {
    id: 'plot-1',
    title: 'The Message',
    premise: 'Mina receives an impossible message.',
    mood: 'mysterious',
    characterName: 'Mina',
    updatedAt,
    episodeNumber: 2,
    status: 'ready_for_next',
    resumeLine: 'Mina learned who sent the message.',
  };
}

function storyPayload(overrides: { status?: 'awaiting_choice' | 'choice_committed'; committedChoiceId?: string } = {}) {
  return {
    id: 'plot-1',
    title: 'The Message',
    premise: 'Mina receives an impossible message.',
    mood: 'mysterious',
    characterName: 'Mina',
    updatedAt: 1_765_888_800_000,
    version: 1,
    episode: {
      id: 'episode-1',
      number: 1,
      title: 'First turn',
      body: 'A sufficiently long story body is returned by the real server.',
      summary: 'Mina must choose.',
      status: overrides.status ?? 'awaiting_choice',
      ...(overrides.committedChoiceId ? { committedChoiceId: overrides.committedChoiceId, committedConsequence: 'Canonical consequence.' } : {}),
      choices: [
        { id: 'choice-a', key: 'A', label: 'Tell the truth', intent: 'confess', consequence: 'Trust changes.' },
        { id: 'choice-b', key: 'B', label: 'Investigate first', intent: 'investigate', consequence: 'A clue appears.' },
        { id: 'choice-c', key: 'C', label: 'Ask for help', intent: 'seek ally', consequence: 'An ally joins.' },
      ],
    },
  };
}
