import { describe, expect, it } from 'vitest';
import type { AccessTokenProvider } from '../src/tts/contracts';
import { GoogleTtsSynthesizer } from '../src/tts/google-tts-synthesizer';

const tokenProvider: AccessTokenProvider = {
  async getAccessToken() {
    return { ok: true, value: { accessToken: 'token-123', expiresAtMillis: Date.now() + 60_000 } };
  },
};

describe('GoogleTtsSynthesizer', () => {
  it('calls Google v1 synthesize with Bearer auth and MP3 output', async () => {
    let requestUrl = '';
    let authorization = '';
    let requestBody: unknown;
    const fetchImpl = (async (...args: Parameters<typeof fetch>) => {
      const [input, init] = args;
      requestUrl = String(input);
      authorization = new Headers(init?.headers).get('Authorization') ?? '';
      requestBody = JSON.parse(String(init?.body));
      return Response.json({ audioContent: btoa('mp3-bytes') });
    }) as typeof fetch;
    const synthesizer = new GoogleTtsSynthesizer(tokenProvider, fetchImpl);

    const result = await synthesizer.synthesize({
      text: '  Xin chào.  ',
      languageCode: 'vi-VN',
      voiceName: 'vi-VN-Wavenet-A',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(requestUrl).toBe('https://texttospeech.googleapis.com/v1/text:synthesize');
    expect(authorization).toBe('Bearer token-123');
    expect(requestBody).toEqual({
      input: { text: 'Xin chào.' },
      voice: { languageCode: 'vi-VN', name: 'vi-VN-Wavenet-A' },
      audioConfig: { audioEncoding: 'MP3' },
    });
    expect(new TextDecoder().decode(result.value.bytes)).toBe('mp3-bytes');
    expect(result.value.contentType).toBe('audio/mpeg');
    expect(result.value.inputCharacters).toBe('Xin chào.'.length);
  });

  it('classifies 429 as retryable provider failure', async () => {
    const fetchImpl = (async () => new Response('rate limited', { status: 429 })) as typeof fetch;
    const synthesizer = new GoogleTtsSynthesizer(tokenProvider, fetchImpl);

    const result = await synthesizer.synthesize({ text: 'Hello', languageCode: 'en-US', voiceName: 'en-US-Wavenet-F' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ code: 'provider_error', retryable: true, status: 429 });
  });

  it('classifies a 400 provider rejection as non-retryable', async () => {
    const fetchImpl = (async () => new Response('bad request', { status: 400 })) as typeof fetch;
    const synthesizer = new GoogleTtsSynthesizer(tokenProvider, fetchImpl);

    const result = await synthesizer.synthesize({ text: 'Hello', languageCode: 'en-US', voiceName: 'en-US-Wavenet-F' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ code: 'provider_error', retryable: false, status: 400 });
  });

  it('rejects missing audioContent as invalid provider response', async () => {
    const fetchImpl = (async () => Response.json({})) as typeof fetch;
    const synthesizer = new GoogleTtsSynthesizer(tokenProvider, fetchImpl);

    const result = await synthesizer.synthesize({ text: 'Hello', languageCode: 'en-US', voiceName: 'en-US-Wavenet-F' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ code: 'invalid_response', retryable: true });
  });
});
