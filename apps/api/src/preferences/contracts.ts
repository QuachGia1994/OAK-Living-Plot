export type UiLocale = 'en' | 'vi';
export type DramaLocale = 'en-US' | 'vi-VN';
export type NarratorVariant = 'en-narrator-female' | 'vi-narrator-female';

export interface UserPreferences {
  uiLocale: UiLocale;
  dramaLocale: DramaLocale;
  narratorVariant: NarratorVariant;
  updatedAt: number | null;
}

export const defaultUserPreferences: UserPreferences = {
  uiLocale: 'en',
  dramaLocale: 'en-US',
  narratorVariant: 'en-narrator-female',
  updatedAt: null,
};

export function isUiLocale(value: unknown): value is UiLocale {
  return value === 'en' || value === 'vi';
}

export function isDramaLocale(value: unknown): value is DramaLocale {
  return value === 'en-US' || value === 'vi-VN';
}

export function isNarratorVariant(value: unknown): value is NarratorVariant {
  return value === 'en-narrator-female' || value === 'vi-narrator-female';
}
