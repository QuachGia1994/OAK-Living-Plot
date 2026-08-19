import type { AppEnv } from '../env';
import type { SpeechSynthesizer } from './contracts';
import { GeminiTtsSynthesizer } from './gemini-tts-synthesizer';

export function createSpeechSynthesizer(
  env: Pick<AppEnv, 'GEMINI_API_KEY'>,
  fetchImpl: typeof fetch = fetch,
): SpeechSynthesizer {
  return new GeminiTtsSynthesizer(env.GEMINI_API_KEY, fetchImpl);
}
