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
    ];
    const client = new HttpStoryExperienceClient('https://api.test', async () => 'token', async () => responses.shift()!);

    await expect(client.loadHome()).rejects.toMatchObject({ code: 'quota_exceeded' });
    await expect(client.loadHome()).rejects.toMatchObject({ code: 'auth_required' });
    await expect(client.loadHome()).rejects.toMatchObject({ code: 'provider_unavailable' });
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

function storyPayload() {
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
      status: 'awaiting_choice',
      choices: [
        { id: 'choice-a', key: 'A', label: 'Tell the truth', intent: 'confess', consequence: 'Trust changes.' },
        { id: 'choice-b', key: 'B', label: 'Investigate first', intent: 'investigate', consequence: 'A clue appears.' },
        { id: 'choice-c', key: 'C', label: 'Ask for help', intent: 'seek ally', consequence: 'An ally joins.' },
      ],
    },
  };
}
