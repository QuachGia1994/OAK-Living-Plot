import { useMemo } from 'react';
import { useMobileAuth } from '../auth/mobile-auth-context';
import {
  HttpSceneArtworkClient,
  UnavailableSceneArtworkClient,
  type SceneArtworkClient,
} from './scene-artwork-client';

const unavailable = new UnavailableSceneArtworkClient();

export function useSceneArtworkClient(): SceneArtworkClient {
  const auth = useMobileAuth();
  const apiBaseUrl = process.env.EXPO_PUBLIC_LIVING_PLOT_API_URL?.trim() ?? '';
  return useMemo(() => {
    if (!apiBaseUrl || !auth.configured) return unavailable;
    return new HttpSceneArtworkClient(apiBaseUrl, auth.getToken);
  }, [apiBaseUrl, auth.configured, auth.getToken]);
}
