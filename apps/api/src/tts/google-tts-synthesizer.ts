import type { AccessTokenProvider, SpeechRequest, SpeechResult, SpeechSynthesizer } from './contracts';

const TTS_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const MAX_TEXT_CHARACTERS = 5000;

type FetchLike = typeof fetch;

interface GoogleTtsResponse {
  audioContent?: unknown;
}

export class GoogleTtsSynthesizer implements SpeechSynthesizer {
  constructor(
    private readonly tokenProvider: AccessTokenProvider,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async synthesize(request: SpeechRequest): Promise<SpeechResult> {
    const text = request.text.normalize('NFC').trim();
    if (!text || text.length > MAX_TEXT_CHARACTERS) {
      return {
        ok: false,
        error: { code: 'invalid_input', message: 'Speech text must be 1–5000 characters.', retryable: false },
      };
    }
    if (!request.languageCode.trim() || !request.voiceName.trim()) {
      return {
        ok: false,
        error: { code: 'invalid_input', message: 'Language code and voice name are required.', retryable: false },
      };
    }

    const token = await this.tokenProvider.getAccessToken();
    if (!token.ok) return token;

    let response: Response;
    try {
      response = await this.fetchImpl(TTS_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.value.accessToken}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: request.languageCode, name: request.voiceName },
          audioConfig: { audioEncoding: 'MP3' },
        }),
      });
    } catch {
      return providerFailure('Google Text-to-Speech request failed.', true);
    }

    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      return providerFailure('Google Text-to-Speech rejected the request.', retryable, response.status);
    }

    let payload: GoogleTtsResponse;
    try {
      payload = (await response.json()) as GoogleTtsResponse;
    } catch {
      return {
        ok: false,
        error: { code: 'invalid_response', message: 'Google Text-to-Speech returned invalid JSON.', retryable: true },
      };
    }

    if (typeof payload.audioContent !== 'string' || !payload.audioContent.trim()) {
      return {
        ok: false,
        error: { code: 'invalid_response', message: 'Google Text-to-Speech returned no audio.', retryable: true },
      };
    }

    try {
      return {
        ok: true,
        value: {
          bytes: decodeBase64(payload.audioContent),
          contentType: 'audio/mpeg',
          inputCharacters: text.length,
        },
      };
    } catch {
      return {
        ok: false,
        error: { code: 'invalid_response', message: 'Google Text-to-Speech returned invalid audio bytes.', retryable: true },
      };
    }
  }
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function providerFailure(message: string, retryable: boolean, status?: number): SpeechResult {
  return { ok: false, error: { code: 'provider_error', message, retryable, status } };
}
