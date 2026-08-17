import type { UserPreferences } from '../preferences/contracts';

export const ACCOUNT_DELETE_CONFIRMATION = 'DELETE MY LIVING PLOT DATA';

export interface AccountExportSnapshot {
  schemaVersion: 1;
  exportedAt: string;
  preferences: UserPreferences;
  entitlement: { tier: 'free' | 'plus'; expiresAt: string | null; syncedAt: string | null };
  usage: Array<{ utcDay: string; textEpisodes: number; voicedEpisodes: number }>;
  plots: AccountExportPlot[];
}

export interface AccountExportPlot {
  title: string;
  premise: string;
  status: 'active' | 'completed' | 'archived';
  locale: string;
  mood: string;
  summary: string;
  characters: Array<{ name: string; role: string; traits: Record<string, unknown> }>;
  episodes: AccountExportEpisode[];
}

export interface AccountExportEpisode {
  number: number;
  title: string;
  script: string;
  summary: string;
  status: 'ready' | 'completed';
  choices: Array<{
    key: string;
    label: string;
    intent: string;
    consequence: string;
    committed: boolean;
  }>;
  audio: Array<{
    voiceVariant: string;
    status: string;
    inputCharacters: number;
    attempts: number;
    readyAt: string | null;
  }>;
}

export type AccountDeleteResult =
  | { ok: true }
  | { ok: false; code: 'invalid_confirmation' | 'audio_cleanup_failed' | 'persistence_error' };
