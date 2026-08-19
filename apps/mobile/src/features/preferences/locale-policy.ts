import type { UserPreferences } from './contracts';

export function preferencesForLanguageCode(languageCode: string | null | undefined): UserPreferences {
  const normalized = languageCode?.trim().toLowerCase() ?? '';
  if (normalized === 'vi' || normalized.startsWith('vi-')) {
    return {
      uiLocale: 'vi',
      dramaLocale: 'vi-VN',
      narratorVariant: 'vi-narrator-female',
      updatedAt: null,
    };
  }
  return {
    uiLocale: 'en',
    dramaLocale: 'en-US',
    narratorVariant: 'en-narrator-female',
    updatedAt: null,
  };
}

export function preferenceValues(preferences: UserPreferences): Omit<UserPreferences, 'updatedAt'> {
  return {
    uiLocale: preferences.uiLocale,
    dramaLocale: preferences.dramaLocale,
    narratorVariant: preferences.narratorVariant,
  };
}

export function preferenceSeedForUnsavedRemote(
  remote: UserPreferences,
  local: UserPreferences,
  device: UserPreferences,
): Omit<UserPreferences, 'updatedAt'> | null {
  if (remote.updatedAt !== null) return null;
  return preferenceValues(local.updatedAt !== null ? local : device);
}
