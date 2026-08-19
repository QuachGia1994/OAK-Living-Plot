import type { SpeechRequest, SpeechResult, SpeechSynthesizer } from './contracts';

export const GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const GEMINI_INTERACTIONS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const MAX_TEXT_CHARACTERS = 5000;
const MAX_INLINE_AUDIO_BYTES = 8 * 1024 * 1024;

type FetchLike = typeof fetch;

interface GeminiTtsResponse {
  output_audio?: {
    type?: string;
    data?: unknown;
    mime_type?: unknown;
  };
  steps?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      data?: unknown;
      mime_type?: unknown;
    }>;
  }>;
}

export class GeminiTtsSynthesizer implements SpeechSynthesizer {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = 20_000,
  ) {}

  async synthesize(request: SpeechRequest): Promise<SpeechResult> {
    const text = request.text.normalize('NFC').trim();
    if (!text || text.length > MAX_TEXT_CHARACTERS) return invalidInput('Speech text must be 1–5000 characters.');
    if ((request.languageCode !== 'vi-VN' && request.languageCode !== 'en-US') || !request.voiceName.trim()) {
      return invalidInput('Approved language code and voice name are required.');
    }
    if (!this.apiKey.trim()) {
      return { ok: false, error: { code: 'auth_failed', message: 'Gemini TTS is not configured.', retryable: false } };
    }

    let response: Response;
    try {
      response = await this.fetchImpl(GEMINI_INTERACTIONS_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
        body: JSON.stringify({
          model: GEMINI_TTS_MODEL,
          input: text,
          response_format: { type: 'audio', mime_type: 'audio/mp3', delivery: 'inline' },
          generation_config: { speech_config: [{ voice: request.voiceName }] },
          store: false,
        }),
      });
    } catch {
      return providerFailure('Gemini TTS request failed.', true);
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { ok: false, error: { code: 'auth_failed', message: 'Gemini TTS authentication was rejected.', retryable: false } };
      }
      return providerFailure(
        'Gemini TTS rejected the request.',
        response.status === 408 || response.status === 429 || response.status >= 500,
        response.status,
      );
    }

    let payload: GeminiTtsResponse;
    try {
      payload = (await response.json()) as GeminiTtsResponse;
    } catch {
      return invalidResponse('Gemini TTS returned invalid JSON.');
    }

    const audio = payload.output_audio?.type === 'audio'
      ? payload.output_audio
      : payload.steps
        ?.filter((step) => step.type === 'model_output')
        .flatMap((step) => step.content ?? [])
        .find((content) => content.type === 'audio');
    if (!audio || typeof audio.data !== 'string' || !audio.data.trim()) return invalidResponse('Gemini TTS returned no inline audio.');
    if (audio.mime_type !== 'audio/mp3' && audio.mime_type !== 'audio/mpeg') return invalidResponse('Gemini TTS returned an unexpected audio format.');
    if (estimatedBase64Bytes(audio.data) > MAX_INLINE_AUDIO_BYTES) return invalidResponse('Gemini TTS returned an oversized audio payload.');

    let bytes: Uint8Array;
    try {
      bytes = decodeBase64(audio.data);
    } catch {
      return invalidResponse('Gemini TTS returned invalid audio bytes.');
    }
    if (!isMp3(bytes)) return invalidResponse('Gemini TTS returned bytes that are not MP3 audio.');

    return {
      ok: true,
      value: {
        bytes,
        contentType: 'audio/mpeg',
        inputCharacters: text.length,
      },
    };
  }
}

function invalidInput(message: string): SpeechResult {
  return { ok: false, error: { code: 'invalid_input', message, retryable: false } };
}

function providerFailure(message: string, retryable: boolean, status?: number): SpeechResult {
  return { ok: false, error: { code: 'provider_error', message, retryable, status } };
}

function invalidResponse(message: string): SpeechResult {
  return { ok: false, error: { code: 'invalid_response', message, retryable: true } };
}

function estimatedBase64Bytes(value: string): number {
  const normalized = value.trim();
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function isMp3(bytes: Uint8Array): boolean {
  if (bytes.length < 3) return false;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
  return bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}
