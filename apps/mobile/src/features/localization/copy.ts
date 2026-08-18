import type { UiLocale } from '../preferences/contracts';

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
} as const satisfies Record<string, LocalizedCopy>;

export function localize(locale: UiLocale, copy: LocalizedCopy): string {
  return copy[locale];
}
