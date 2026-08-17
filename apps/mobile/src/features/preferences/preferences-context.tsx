import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMobileAuth } from '@/features/auth/mobile-auth-context';
import { HttpPreferencesClient, PreviewPreferencesClient } from './client';
import type { UserPreferences } from './contracts';
import { defaultUserPreferences } from './contracts';

interface PreferencesContextValue {
  preferences: UserPreferences;
  loading: boolean;
  error: string | null;
  save(next: Omit<UserPreferences, 'updatedAt'>): Promise<void>;
  refresh(): Promise<void>;
}

const previewClient = new PreviewPreferencesClient();
const PreferencesContext = createContext<PreferencesContextValue>({
  preferences: defaultUserPreferences,
  loading: false,
  error: null,
  async save() {},
  async refresh() {},
});

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const auth = useMobileAuth();
  const apiBaseUrl = process.env.EXPO_PUBLIC_LIVING_PLOT_API_URL?.trim() ?? '';
  const client = useMemo(() => {
    if (!apiBaseUrl || !auth.configured || !auth.isLoaded || !auth.isSignedIn) return previewClient;
    return new HttpPreferencesClient(apiBaseUrl, auth.getToken);
  }, [apiBaseUrl, auth.configured, auth.getToken, auth.isLoaded, auth.isSignedIn]);
  const [preferences, setPreferences] = useState<UserPreferences>(defaultUserPreferences);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPreferences(await client.load());
    } catch {
      setError('Preferences could not be loaded. Existing stories are unchanged.');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    let active = true;
    void client.load()
      .then((next) => {
        if (!active) return;
        setPreferences(next);
        setError(null);
      })
      .catch(() => {
        if (active) setError('Preferences could not be loaded. Existing stories are unchanged.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [client]);

  const save = useCallback(async (next: Omit<UserPreferences, 'updatedAt'>) => {
    setLoading(true);
    setError(null);
    try {
      setPreferences(await client.save(next));
    } catch {
      setError('Preferences could not be saved. Existing stories are unchanged.');
      throw new Error('preferences_save_failed');
    } finally {
      setLoading(false);
    }
  }, [client]);

  const value = useMemo(() => ({ preferences, loading, error, save, refresh }), [error, loading, preferences, refresh, save]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function useUserPreferences(): PreferencesContextValue {
  return useContext(PreferencesContext);
}
