export type UiLocale = 'en' | 'vi';
export type DramaLocale = 'en-US' | 'vi-VN';
export type NarratorVariant = 'en-narrator-female' | 'vi-narrator-female';

export interface UserPreferences {
  uiLocale: UiLocale;
  dramaLocale: DramaLocale;
  narratorVariant: NarratorVariant;
  updatedAt: number | null;
}

export interface PreferencesClient {
  readonly configured: boolean;
  load(): Promise<UserPreferences>;
  save(preferences: Omit<UserPreferences, 'updatedAt'>): Promise<UserPreferences>;
}

export const defaultUserPreferences: UserPreferences = {
  uiLocale: 'en',
  dramaLocale: 'en-US',
  narratorVariant: 'en-narrator-female',
  updatedAt: null,
};
