import type { UserPreferences } from '../preferences/contracts';

export const ACCOUNT_DELETE_CONFIRMATION = 'DELETE MY LIVING PLOT DATA';

export interface AccountExportSnapshot {
  schemaVersion: 2;
  exportedAt: string;
  preferences: UserPreferences;
  entitlement: { tier: 'free' | 'plus'; expiresAt: string | null; syncedAt: string | null };
  usage: Array<{ utcDay: string; generatedScenes: number; voicedScenes: number }>;
  dramas: AccountExportDrama[];
}

export interface AccountExportDrama {
  title: string;
  premise: string;
  status: 'active' | 'completed' | 'archived';
  locale: string;
  mood: string;
  summary: string;
  characters: Array<{ name: string; role: string; traits: Record<string, unknown> }>;
  scenes: AccountExportScene[];
}

export interface AccountExportScene {
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
  media: Array<{
    kind: 'voice';
    variant: string;
    status: string;
    attempts: number;
    readyAt: string | null;
  }>;
}

export type AccountDeleteResult =
  | { ok: true }
  | { ok: false; code: 'invalid_confirmation' | 'audio_cleanup_failed' | 'persistence_error' };
