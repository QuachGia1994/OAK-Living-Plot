import { useMemo } from 'react';
import { useMobileAuth } from '../auth/mobile-auth-context';
import { HttpCharacterPortraitClient, UnavailableCharacterPortraitClient, type CharacterPortraitClient } from './portrait-client';

const unavailable = new UnavailableCharacterPortraitClient();

export function useCharacterPortraitClient(): CharacterPortraitClient {
  const auth = useMobileAuth();
  const apiBaseUrl = process.env.EXPO_PUBLIC_LIVING_PLOT_API_URL?.trim() ?? '';
  return useMemo(() => {
    if (!apiBaseUrl || !auth.configured) return unavailable;
    return new HttpCharacterPortraitClient(apiBaseUrl, auth.getToken);
  }, [apiBaseUrl, auth.configured, auth.getToken]);
}
