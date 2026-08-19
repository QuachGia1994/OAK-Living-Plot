import { getLocales } from 'expo-localization';
import type { UserPreferences } from './contracts';
import { preferencesForLanguageCode } from './locale-policy';

export function deviceDefaultPreferences(): UserPreferences {
  const locale = getLocales()[0];
  return preferencesForLanguageCode(locale?.languageCode ?? locale?.languageTag);
}
