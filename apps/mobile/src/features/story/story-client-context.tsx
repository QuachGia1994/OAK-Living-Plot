import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useMobileAuth } from '@/features/auth/mobile-auth-context';
import { useUserPreferences } from '@/features/preferences/preferences-context';
import type { StoryExperienceClient } from './contracts';
import { AuthRequiredStoryExperienceClient, HttpStoryExperienceClient } from './http-client';
import { PreviewStoryExperienceClient, PreviewStoryExperienceState } from './preview-client';

const previewState = new PreviewStoryExperienceState();
const previewClients = new Map<string, PreviewStoryExperienceClient>();
const defaultPreviewClient = previewClientFor('en', 'en-US');
const authRequiredClient = new AuthRequiredStoryExperienceClient();
const StoryClientContext = createContext<StoryExperienceClient>(defaultPreviewClient);

export function StoryExperienceClientProvider({ children }: { children: ReactNode }) {
  const auth = useMobileAuth();
  const { preferences } = useUserPreferences();
  const apiBaseUrl = process.env.EXPO_PUBLIC_LIVING_PLOT_API_URL?.trim() ?? '';
  const client = useMemo<StoryExperienceClient>(() => {
    if (!apiBaseUrl || !auth.configured) return previewClientFor(preferences.uiLocale, preferences.storyLocale);
    if (!auth.isLoaded || !auth.isSignedIn) return authRequiredClient;
    return new HttpStoryExperienceClient(apiBaseUrl, auth.getToken, fetch, preferences.storyLocale);
  }, [apiBaseUrl, auth.configured, auth.getToken, auth.isLoaded, auth.isSignedIn, preferences.storyLocale, preferences.uiLocale]);

  return <StoryClientContext.Provider value={client}>{children}</StoryClientContext.Provider>;
}

export function useStoryExperienceClient(): StoryExperienceClient {
  return useContext(StoryClientContext);
}

function previewClientFor(uiLocale: 'en' | 'vi', storyLocale: 'en-US' | 'vi-VN'): PreviewStoryExperienceClient {
  const key = `${uiLocale}:${storyLocale}`;
  const existing = previewClients.get(key);
  if (existing) return existing;
  const client = new PreviewStoryExperienceClient(uiLocale, storyLocale, previewState);
  previewClients.set(key, client);
  return client;
}
