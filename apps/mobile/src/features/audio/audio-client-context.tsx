import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useMobileAuth } from '@/features/auth/mobile-auth-context';
import type { SceneVoiceClient } from './contracts';
import { HttpSceneVoiceClient, UnavailableSceneVoiceClient } from './http-audio-client';

const unavailable = new UnavailableSceneVoiceClient();
const SceneVoiceClientContext = createContext<SceneVoiceClient>(unavailable);

export function SceneVoiceClientProvider({ children }: { children: ReactNode }) {
  const auth = useMobileAuth();
  const apiBaseUrl = process.env.EXPO_PUBLIC_LIVING_PLOT_API_URL?.trim() ?? '';
  const client = useMemo<SceneVoiceClient>(() => {
    if (!apiBaseUrl || !auth.configured || !auth.isLoaded || !auth.isSignedIn) return unavailable;
    return new HttpSceneVoiceClient(apiBaseUrl, auth.getToken);
  }, [apiBaseUrl, auth.configured, auth.getToken, auth.isLoaded, auth.isSignedIn]);

  return <SceneVoiceClientContext.Provider value={client}>{children}</SceneVoiceClientContext.Provider>;
}

export function useSceneVoiceClient(): SceneVoiceClient {
  return useContext(SceneVoiceClientContext);
}
