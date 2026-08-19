import { describe, expect, it } from 'vitest';
import { GEMINI_TTS_MODEL, GeminiTtsSynthesizer } from '../src/tts/gemini-tts-synthesizer';
import { approvedVoice } from '../src/tts/voice-registry';

const MP3_BYTES = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00]);

describe('GeminiTtsSynthesizer', () => {
  it('uses the official Interactions TTS contract with server API-key auth and MP3 inline output', async () => {
    let requestUrl = '';
    let requestHeaders = new Headers();
    let requestBody: Record<string, unknown> = {};
    const fetchImpl = (async (...args: Parameters<typeof fetch>) => {
      const [input, init] = args;
      requestUrl = String(input);
      requestHeaders = new Headers(init?.headers);
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json(audioResponse(MP3_BYTES));
    }) as typeof fetch;
    const synthesizer = new GeminiTtsSynthesizer('server-gemini-key', fetchImpl);

    const result = await synthesizer.synthesize({
      text: '  Xin chào.  ',
      languageCode: 'vi-VN',
      voiceName: 'Aoede',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(requestUrl).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
    expect(requestHeaders.get('x-goog-api-key')).toBe('server-gemini-key');
    expect(requestHeaders.get('Authorization')).toBeNull();
    expect(requestBody).toEqual({
      model: GEMINI_TTS_MODEL,
      input: 'Xin chào.',
      response_format: { type: 'audio', mime_type: 'audio/mp3', delivery: 'inline' },
      generation_config: { speech_config: [{ voice: 'Aoede' }] },
      store: false,
    });
    expect(result.value.bytes).toEqual(MP3_BYTES);
    expect(result.value.contentType).toBe('audio/mpeg');
    expect(result.value.inputCharacters).toBe('Xin chào.'.length);
  });

  it('maps both public narrator variants to supported Gemini voices and locales', () => {
    expect(approvedVoice('vi-narrator-female')).toEqual({
      variant: 'vi-narrator-female',
      languageCode: 'vi-VN',
      providerVoiceId: 'Aoede',
    });
    expect(approvedVoice('en-narrator-female')).toEqual({
      variant: 'en-narrator-female',
      languageCode: 'en-US',
      providerVoiceId: 'Aoede',
    });
  });

  it('classifies rate limiting and transient provider errors as retryable', async () => {
    for (const status of [408, 429, 503]) {
      const synthesizer = new GeminiTtsSynthesizer('server-gemini-key', (async () => new Response('unavailable', { status })) as typeof fetch);
      const result = await synthesizer.synthesize(request());
      expect(result).toMatchObject({ ok: false, error: { code: 'provider_error', retryable: true, status } });
    }
  });

  it('classifies auth and invalid requests as terminal', async () => {
    const auth = new GeminiTtsSynthesizer('server-gemini-key', (async () => new Response('forbidden', { status: 403 })) as typeof fetch);
    expect(await auth.synthesize(request())).toMatchObject({ ok: false, error: { code: 'auth_failed', retryable: false } });

    const badRequest = new GeminiTtsSynthesizer('server-gemini-key', (async () => new Response('bad request', { status: 400 })) as typeof fetch);
    expect(await badRequest.synthesize(request())).toMatchObject({ ok: false, error: { code: 'provider_error', retryable: false, status: 400 } });
  });

  it('normalizes network or timeout failure as retryable provider failure', async () => {
    const synthesizer = new GeminiTtsSynthesizer('server-gemini-key', (async () => {
      throw new DOMException('timed out', 'TimeoutError');
    }) as typeof fetch);

    expect(await synthesizer.synthesize(request())).toMatchObject({ ok: false, error: { code: 'provider_error', retryable: true } });
  });

  it('rejects malformed, wrong-format, oversized, and non-MP3 provider output', async () => {
    const cases: unknown[] = [
      {},
      { steps: [{ type: 'model_output', content: [{ type: 'audio', data: base64(MP3_BYTES), mime_type: 'audio/wav' }] }] },
      { steps: [{ type: 'model_output', content: [{ type: 'audio', data: 'A'.repeat(12_000_000), mime_type: 'audio/mp3' }] }] },
      audioResponse(new TextEncoder().encode('not-mp3')),
    ];

    for (const payload of cases) {
      const synthesizer = new GeminiTtsSynthesizer('server-gemini-key', (async () => Response.json(payload)) as typeof fetch);
      expect(await synthesizer.synthesize(request())).toMatchObject({ ok: false, error: { code: 'invalid_response', retryable: true } });
    }
  });

  it('fails closed before network I/O when the server API key is missing', async () => {
    let called = false;
    const synthesizer = new GeminiTtsSynthesizer('', (async () => {
      called = true;
      return Response.json(audioResponse(MP3_BYTES));
    }) as typeof fetch);

    expect(await synthesizer.synthesize(request())).toMatchObject({ ok: false, error: { code: 'auth_failed', retryable: false } });
    expect(called).toBe(false);
  });
});

function request() {
  return { text: 'Narration', languageCode: 'en-US', voiceName: 'Aoede' };
}

function audioResponse(bytes: Uint8Array): unknown {
  return {
    steps: [{
      type: 'model_output',
      content: [{ type: 'audio', data: base64(bytes), mime_type: 'audio/mp3' }],
    }],
  };
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
