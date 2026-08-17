import { describe, expect, it, vi } from 'vitest';
import { EpisodeAudioClientError } from '../src/features/audio/contracts';
import { HttpEpisodeAudioClient } from '../src/features/audio/http-audio-client';

describe('HttpEpisodeAudioClient', () => {
  it('requests and polls private audio with fresh bearer tokens', async () => {
    const tokens = ['token-one', 'token-two'];
    const getToken = vi.fn(async () => tokens.shift() ?? null);
    const fetcher = vi.fn<TestFetch>(async () => Response.json({ audio: audioPayload('queued') }, { status: 202 }));
    const client = new HttpEpisodeAudioClient('https://api.test/', getToken, fetcher);

    await client.request('episode-1', 'vi-narrator-female', 'voice-stable-001');
    await client.loadStatus('audio-1');

    expect(getToken).toHaveBeenCalledTimes(2);
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer token-one');
    expect(new Headers(fetcher.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer token-two');
    expect(String(fetcher.mock.calls[1][0])).toBe('https://api.test/v1/audio/audio-1/status');
  });

  it('builds an authenticated playback source without exposing a public audio URL', async () => {
    const client = new HttpEpisodeAudioClient('https://api.test', async () => 'private-token', vi.fn());
    await expect(client.playbackSource('audio-1')).resolves.toEqual({
      uri: 'https://api.test/v1/audio/audio-1',
      headers: { Authorization: 'Bearer private-token' },
    });
  });

  it('maps server voice quota and rejects missing auth', async () => {
    const quotaClient = new HttpEpisodeAudioClient(
      'https://api.test',
      async () => 'token',
      async () => Response.json({ error: 'quota_exceeded' }, { status: 429 }),
    );
    await expect(quotaClient.request('episode-1', 'en-narrator-female', 'voice-limit-001')).rejects.toMatchObject({
      code: 'quota_exceeded',
    });

    const authClient = new HttpEpisodeAudioClient('https://api.test', async () => null, vi.fn());
    await expect(authClient.loadStatus('audio-1')).rejects.toEqual(
      new EpisodeAudioClientError('auth_required', 'Sign in before generating or playing private voice audio.'),
    );
  });
});

type TestFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function audioPayload(status: 'queued' | 'ready') {
  return {
    id: 'audio-1',
    episodeId: 'episode-1',
    voiceVariant: 'vi-narrator-female',
    status,
    inputCharacters: status === 'ready' ? 120 : 0,
    attempts: status === 'ready' ? 1 : 0,
    cached: status === 'ready',
    failureCode: null,
  };
}
