import type { DramaMood } from '@/features/drama/domain';
import type { UiLocale } from '@/features/preferences/contracts';

const DRAMA_MOOD_LABELS: Record<DramaMood, Record<UiLocale, string>> = {
  tense: { en: 'Tense', vi: 'Căng thẳng' },
  romantic: { en: 'Romantic', vi: 'Lãng mạn' },
  mysterious: { en: 'Mysterious', vi: 'Bí ẩn' },
  hopeful: { en: 'Hopeful', vi: 'Hy vọng' },
};

export function dramaMoodLabel(mood: DramaMood, locale: UiLocale): string {
  return DRAMA_MOOD_LABELS[mood][locale];
}
