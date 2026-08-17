import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useMobileAuth } from '@/features/auth/mobile-auth-context';
import { useUserPreferences } from '@/features/preferences/preferences-context';
import type { StoryExperienceClient } from './contracts';
import { AuthRequiredStoryExperienceClient, HttpStoryExperienceClient } from './http-client';
import { PreviewStoryExperienceClient } from './preview-client';

const previewClient = new PreviewStoryExperienceClient();
const authRequiredClient = new AuthRequiredStoryExperienceClient();
const StoryClientContext = createContext<StoryExperienceClient>(previewClient);

export function StoryExperienceClientProvider({ children }: { children: ReactNode }) {
  const auth = useMobileAuth();
  const { preferences } = useUserPreferences();
  const apiBaseUrl = process.env.EXPO_PUBLIC_LIVING_PLOT_API_URL?.trim() ?? '';
  const client = useMemo<StoryExperienceClient>(() => {
    if (!apiBaseUrl || !auth.configured) return previewClient;
    if (!auth.isLoaded || !auth.isSignedIn) return authRequiredClient;
    return new HttpStoryExperienceClient(apiBaseUrl, auth.getToken, fetch, preferences.storyLocale);
  }, [apiBaseUrl, auth.configured, auth.getToken, auth.isLoaded, auth.isSignedIn, preferences.storyLocale]);

  return <StoryClientContext.Provider value={client}>{children}</StoryClientContext.Provider>;
}

export function useStoryExperienceClient(): StoryExperienceClient {
  return useContext(StoryClientContext);
}
