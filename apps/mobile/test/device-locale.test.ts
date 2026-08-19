import { describe, expect, it } from 'vitest';
import { preferenceSeedForUnsavedRemote, preferencesForLanguageCode } from '../src/features/preferences/locale-policy';

describe('device locale preference defaults', () => {
  it('maps Vietnamese app/device locale to Vietnamese UI, drama and narrator defaults', () => {
    expect(preferencesForLanguageCode('vi')).toEqual({
      uiLocale: 'vi',
      dramaLocale: 'vi-VN',
      narratorVariant: 'vi-narrator-female',
      updatedAt: null,
    });
    expect(preferencesForLanguageCode('vi-VN').uiLocale).toBe('vi');
  });

  it('falls back to English for other or unavailable locales', () => {
    expect(preferencesForLanguageCode('en-US').uiLocale).toBe('en');
    expect(preferencesForLanguageCode('ja-JP').dramaLocale).toBe('en-US');
    expect(preferencesForLanguageCode(null).narratorVariant).toBe('en-narrator-female');
  });

  it('seeds an unsaved authenticated profile from an explicit local choice or the device locale', () => {
    const unsavedRemote = preferencesForLanguageCode('en-US');
    const deviceVietnamese = preferencesForLanguageCode('vi-VN');
    const explicitLocal = { ...preferencesForLanguageCode('en-US'), updatedAt: 123 };

    expect(preferenceSeedForUnsavedRemote(unsavedRemote, explicitLocal, deviceVietnamese)?.uiLocale).toBe('en');
    expect(preferenceSeedForUnsavedRemote(unsavedRemote, unsavedRemote, deviceVietnamese)?.uiLocale).toBe('vi');
    expect(preferenceSeedForUnsavedRemote({ ...unsavedRemote, updatedAt: 456 }, unsavedRemote, deviceVietnamese)).toBeNull();
  });
});
