export interface SpeechRequest {
  text: string;
  languageCode: string;
  voiceName: string;
}

export interface SpeechArtifact {
  bytes: Uint8Array;
  contentType: 'audio/mpeg';
  inputCharacters: number;
}

export type SpeechError =
  | { code: 'invalid_input'; message: string; retryable: false }
  | { code: 'auth_failed'; message: string; retryable: boolean }
  | { code: 'provider_error'; message: string; retryable: boolean; status?: number }
  | { code: 'invalid_response'; message: string; retryable: boolean };

export type SpeechResult =
  | { ok: true; value: SpeechArtifact }
  | { ok: false; error: SpeechError };

export interface SpeechSynthesizer {
  synthesize(request: SpeechRequest): Promise<SpeechResult>;
}

export interface AccessTokenResult {
  accessToken: string;
  expiresAtMillis: number;
}

export interface AccessTokenProvider {
  getAccessToken(): Promise<{ ok: true; value: AccessTokenResult } | { ok: false; error: SpeechError }>;
}
