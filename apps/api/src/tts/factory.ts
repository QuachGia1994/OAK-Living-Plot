import type { AppEnv } from '../env';
import type { SpeechSynthesizer } from './contracts';
import { GoogleAccessTokenProvider } from './google-access-token-provider';
import { GoogleTtsSynthesizer } from './google-tts-synthesizer';

export function createSpeechSynthesizer(
  env: Pick<AppEnv, 'GOOGLE_SERVICE_ACCOUNT_EMAIL' | 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY'>,
  fetchImpl: typeof fetch = fetch,
): SpeechSynthesizer {
  const tokenProvider = new GoogleAccessTokenProvider(
    env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
    fetchImpl,
  );
  return new GoogleTtsSynthesizer(tokenProvider, fetchImpl);
}
