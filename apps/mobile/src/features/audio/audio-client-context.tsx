import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useMobileAuth } from '@/features/auth/mobile-auth-context';
import type { EpisodeAudioClient } from './contracts';
import { HttpEpisodeAudioClient, UnavailableEpisodeAudioClient } from './http-audio-client';

const unavailable = new UnavailableEpisodeAudioClient();
const EpisodeAudioClientContext = createContext<EpisodeAudioClient>(unavailable);

export function EpisodeAudioClientProvider({ children }: { children: ReactNode }) {
  const auth = useMobileAuth();
  const apiBaseUrl = process.env.EXPO_PUBLIC_LIVING_PLOT_API_URL?.trim() ?? '';
  const client = useMemo<EpisodeAudioClient>(() => {
    if (!apiBaseUrl || !auth.configured || !auth.isLoaded || !auth.isSignedIn) return unavailable;
    return new HttpEpisodeAudioClient(apiBaseUrl, auth.getToken);
  }, [apiBaseUrl, auth.configured, auth.getToken, auth.isLoaded, auth.isSignedIn]);

  return <EpisodeAudioClientContext.Provider value={client}>{children}</EpisodeAudioClientContext.Provider>;
}

export function useEpisodeAudioClient(): EpisodeAudioClient {
  return useContext(EpisodeAudioClientContext);
}
