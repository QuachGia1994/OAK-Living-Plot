import { describe, expect, it, vi } from 'vitest';
import { SceneVoiceClientError } from '../src/features/audio/contracts';
import { HttpSceneVoiceClient } from '../src/features/audio/http-audio-client';

describe('HttpSceneVoiceClient', () => {
  it('requests and polls private scene voice with fresh bearer tokens', async () => {
    const tokens = ['token-one', 'token-two'];
    const getToken = vi.fn(async () => tokens.shift() ?? null);
    const fetcher = vi.fn<TestFetch>(async () => Response.json({ media: mediaPayload('queued') }, { status: 202 }));
    const client = new HttpSceneVoiceClient('https://api.test/', getToken, fetcher);

    await client.request('scene-1', 'vi-narrator-female', 'voice-stable-001');
    await client.loadStatus('media-1');

    expect(getToken).toHaveBeenCalledTimes(2);
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer token-one');
    expect(new Headers(fetcher.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer token-two');
    expect(String(fetcher.mock.calls[0][0])).toBe('https://api.test/v1/scenes/scene-1/voice');
    expect(String(fetcher.mock.calls[1][0])).toBe('https://api.test/v1/media/media-1/status');
  });

  it('builds an authenticated media source without exposing a public URL', async () => {
    const client = new HttpSceneVoiceClient('https://api.test', async () => 'private-token', vi.fn());
    await expect(client.playbackSource('media-1')).resolves.toEqual({
      uri: 'https://api.test/v1/media/media-1',
      headers: { Authorization: 'Bearer private-token' },
    });
  });

  it('rejects persistence-only media states at the product boundary', async () => {
    const client = new HttpSceneVoiceClient(
      'https://api.test',
      async () => 'token',
      async () => Response.json({ media: { ...mediaPayload('queued'), status: 'staged' } }),
    );

    await expect(client.loadStatus('media-1')).rejects.toMatchObject({ code: 'backend_unavailable' });
  });

  it('maps server voice quota and rejects missing auth', async () => {
    const quotaClient = new HttpSceneVoiceClient(
      'https://api.test',
      async () => 'token',
      async () => Response.json({ error: 'quota_exceeded' }, { status: 429 }),
    );
    await expect(quotaClient.request('scene-1', 'en-narrator-female', 'voice-limit-001')).rejects.toMatchObject({ code: 'quota_exceeded' });

    const authClient = new HttpSceneVoiceClient('https://api.test', async () => null, vi.fn());
    await expect(authClient.loadStatus('media-1')).rejects.toEqual(
      new SceneVoiceClientError('auth_required', 'Sign in before generating or playing private voice audio.'),
    );
  });
});

type TestFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function mediaPayload(status: 'queued' | 'ready') {
  return {
    id: 'media-1',
    sceneId: 'scene-1',
    kind: 'voice',
    variant: 'vi-narrator-female',
    status,
    attempts: status === 'ready' ? 1 : 0,
    cached: status === 'ready',
    failureCode: null,
  };
}
