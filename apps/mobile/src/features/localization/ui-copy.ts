import { useCallback } from 'react';
import { useUserPreferences } from '@/features/preferences/preferences-context';
import type { UiLocale } from '@/features/preferences/contracts';

export interface LocalizedCopy {
  en: string;
  vi: string;
}

export const sharedUiCopy = {
  back: { en: 'Back', vi: 'Quay lại' },
  cancel: { en: 'Cancel', vi: 'Hủy' },
  home: { en: 'Home', vi: 'Trang chủ' },
  tryAgain: { en: 'Try again', vi: 'Thử lại' },
  signIn: { en: 'Continue with email', vi: 'Tiếp tục bằng email' },
  signOut: { en: 'Sign out', vi: 'Đăng xuất' },
  loadingStory: { en: 'Loading your story…', vi: 'Đang tải câu chuyện…' },
} as const satisfies Record<string, LocalizedCopy>;

export function localize(locale: UiLocale, copy: LocalizedCopy): string {
  return copy[locale];
}

export function useUiCopy() {
  const { preferences } = useUserPreferences();
  const locale = preferences.uiLocale;
  const t = useCallback((en: string, vi: string) => localize(locale, { en, vi }), [locale]);
  return { locale, t };
}
