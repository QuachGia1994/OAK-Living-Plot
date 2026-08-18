import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useMobileAuth } from '@/features/auth/mobile-auth-context';
import { useUserPreferences } from '@/features/preferences/preferences-context';
import type { DramaExperienceClient } from './contracts';
import { AuthRequiredDramaExperienceClient, HttpDramaExperienceClient } from './http-client';
import { PreviewDramaExperienceClient, PreviewDramaState } from './preview-client';

const previewState = new PreviewDramaState();
const previewClients = new Map<string, PreviewDramaExperienceClient>();
const defaultPreviewClient = previewClientFor('en', 'en-US');
const authRequiredClient = new AuthRequiredDramaExperienceClient();
const DramaClientContext = createContext<DramaExperienceClient>(defaultPreviewClient);

export function DramaExperienceClientProvider({ children }: { children: ReactNode }) {
  const auth = useMobileAuth();
  const { preferences } = useUserPreferences();
  const apiBaseUrl = process.env.EXPO_PUBLIC_LIVING_PLOT_API_URL?.trim() ?? '';
  const client = useMemo<DramaExperienceClient>(() => {
    if (!apiBaseUrl || !auth.configured) return previewClientFor(preferences.uiLocale, preferences.dramaLocale);
    if (!auth.isLoaded || !auth.isSignedIn) return authRequiredClient;
    return new HttpDramaExperienceClient(apiBaseUrl, auth.getToken, fetch, preferences.dramaLocale, preferences.uiLocale);
  }, [apiBaseUrl, auth.configured, auth.getToken, auth.isLoaded, auth.isSignedIn, preferences.dramaLocale, preferences.uiLocale]);

  return <DramaClientContext.Provider value={client}>{children}</DramaClientContext.Provider>;
}

export function useDramaExperienceClient(): DramaExperienceClient {
  return useContext(DramaClientContext);
}

function previewClientFor(uiLocale: 'en' | 'vi', dramaLocale: 'en-US' | 'vi-VN'): PreviewDramaExperienceClient {
  const key = `${uiLocale}:${dramaLocale}`;
  const existing = previewClients.get(key);
  if (existing) return existing;
  const client = new PreviewDramaExperienceClient(uiLocale, dramaLocale, previewState);
  previewClients.set(key, client);
  return client;
}
