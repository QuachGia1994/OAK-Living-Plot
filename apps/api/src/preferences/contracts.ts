export type UiLocale = 'en' | 'vi';
export type StoryLocale = 'en-US' | 'vi-VN';
export type NarratorVariant = 'en-narrator-female' | 'vi-narrator-female';

export interface UserPreferences {
  uiLocale: UiLocale;
  storyLocale: StoryLocale;
  narratorVariant: NarratorVariant;
  updatedAt: number | null;
}

export const defaultUserPreferences: UserPreferences = {
  uiLocale: 'en',
  storyLocale: 'en-US',
  narratorVariant: 'en-narrator-female',
  updatedAt: null,
};

export function isUiLocale(value: unknown): value is UiLocale {
  return value === 'en' || value === 'vi';
}

export function isStoryLocale(value: unknown): value is StoryLocale {
  return value === 'en-US' || value === 'vi-VN';
}

export function isNarratorVariant(value: unknown): value is NarratorVariant {
  return value === 'en-narrator-female' || value === 'vi-narrator-female';
}
