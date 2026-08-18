import { describe, expect, it } from 'vitest';
import { createSceneVoiceClient } from '../src/features/audio/http-audio-client';

describe('scene voice client selection', () => {
  it('uses the unavailable client only when public live configuration is absent', async () => {
    const missingApi = createSceneVoiceClient('', true, async () => null);
    const missingClerk = createSceneVoiceClient('https://api.test', false, async () => null);

    expect(missingApi.configured).toBe(false);
    expect(missingClerk.configured).toBe(false);
    await expect(missingApi.request('scene-1', 'vi-narrator-female', 'voice-preview-001')).rejects.toMatchObject({ code: 'not_configured' });
  });

  it('keeps the HTTP client configured while the Clerk session is signed out or loading', async () => {
    const signedOut = createSceneVoiceClient('https://api.test', true, async () => null);
    const loading = createSceneVoiceClient('https://api.test', true, async () => null);

    expect(signedOut.configured).toBe(true);
    expect(loading.configured).toBe(true);
    await expect(signedOut.loadStatus('media-1')).rejects.toMatchObject({ code: 'auth_required' });
    await expect(loading.loadStatus('media-1')).rejects.toMatchObject({ code: 'auth_required' });
  });
});
