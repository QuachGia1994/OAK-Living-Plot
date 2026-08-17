import { useCallback } from 'react';
import { useUserPreferences } from '../preferences/preferences-context';
import { localize } from './copy';

export { localize, sharedUiCopy } from './copy';
export type { LocalizedCopy } from './copy';

export function useUiCopy() {
  const { preferences } = useUserPreferences();
  const locale = preferences.uiLocale;
  const t = useCallback((en: string, vi: string) => localize(locale, { en, vi }), [locale]);
  return { locale, t };
}
