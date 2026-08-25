import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMobileAuth } from '@/features/auth/mobile-auth-context';
import { HttpPreferencesClient, PreviewPreferencesClient } from './client';
import type { PreferencesClient, UserPreferences } from './contracts';
import { deviceDefaultPreferences } from './device-locale';
import { preferenceSeedForUnsavedRemote } from './locale-policy';

export type PreferencesErrorCode = 'load_failed' | 'save_failed';

interface PreferencesContextValue {
  preferences: UserPreferences;
  loading: boolean;
  error: PreferencesErrorCode | null;
  save(next: Omit<UserPreferences, 'updatedAt'>): Promise<void>;
  refresh(): Promise<void>;
}

const previewClient = new PreviewPreferencesClient();
const initialDevicePreferences = deviceDefaultPreferences();
const PreferencesContext = createContext<PreferencesContextValue>({
  preferences: initialDevicePreferences,
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
  const [preferences, setPreferences] = useState<UserPreferences>(initialDevicePreferences);
  const preferencesRef = useRef(preferences);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<PreferencesErrorCode | null>(null);

  const applyPreferences = useCallback((next: UserPreferences) => {
    preferencesRef.current = next;
    setPreferences(next);
  }, []);

  const loadResolvedPreferences = useCallback(async (target: PreferencesClient): Promise<UserPreferences> => {
    const loaded = await target.load();
    if (!target.configured) return loaded;
    const seed = preferenceSeedForUnsavedRemote(loaded, preferencesRef.current, deviceDefaultPreferences());
    return seed ? target.save(seed) : loaded;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      applyPreferences(await loadResolvedPreferences(client));
    } catch {
      setError('load_failed');
    } finally {
      setLoading(false);
    }
  }, [applyPreferences, client, loadResolvedPreferences]);

  useEffect(() => {
    let active = true;
    void loadResolvedPreferences(client)
      .then((next) => {
        if (!active) return;
        applyPreferences(next);
        setError(null);
      })
      .catch(() => {
        if (active) setError('load_failed');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [applyPreferences, client, loadResolvedPreferences]);

  const save = useCallback(async (next: Omit<UserPreferences, 'updatedAt'>) => {
    setLoading(true);
    setError(null);
    try {
      applyPreferences(await client.save(next));
    } catch {
      setError('save_failed');
      throw new Error('preferences_save_failed');
    } finally {
      setLoading(false);
    }
  }, [applyPreferences, client]);

  const value = useMemo(() => ({ preferences, loading, error, save, refresh }), [error, loading, preferences, refresh, save]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function useUserPreferences(): PreferencesContextValue {
  return useContext(PreferencesContext);
}
