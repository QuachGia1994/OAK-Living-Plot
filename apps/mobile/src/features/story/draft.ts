import type { UiLocale } from '@/features/preferences/contracts';
import type { PlotDraft, StoryMood } from './contracts';

const MOOD_COPY: Record<StoryMood, Record<UiLocale, { label: string; description: string }>> = {
  tense: {
    en: { label: 'Tense', description: 'Secrets, pressure, hard choices' },
    vi: { label: 'Căng thẳng', description: 'Bí mật, áp lực, lựa chọn khó' },
  },
  romantic: {
    en: { label: 'Romantic', description: 'Chemistry, vulnerability, longing' },
    vi: { label: 'Lãng mạn', description: 'Rung động, mong manh, khao khát' },
  },
  mysterious: {
    en: { label: 'Mysterious', description: 'Clues, doubt, hidden motives' },
    vi: { label: 'Bí ẩn', description: 'Manh mối, nghi ngờ, động cơ ẩn' },
  },
  hopeful: {
    en: { label: 'Hopeful', description: 'Second chances, courage, recovery' },
    vi: { label: 'Hy vọng', description: 'Cơ hội thứ hai, can đảm, hồi phục' },
  },
};

export const storyMoodOptions: readonly { value: StoryMood; label: string; description: string }[] = storyMoodOptionsFor('en');

export function storyMoodOptionsFor(locale: UiLocale): readonly { value: StoryMood; label: string; description: string }[] {
  return (['tense', 'romantic', 'mysterious', 'hopeful'] as const).map((value) => ({ value, ...MOOD_COPY[value][locale] }));
}

export interface PlotDraftErrors {
  premise?: string;
  characterName?: string;
}

export function normalizePlotDraft(draft: PlotDraft): PlotDraft {
  return {
    premise: draft.premise.normalize('NFC').trim().replace(/\s+/g, ' '),
    mood: draft.mood,
    characterName: draft.characterName.normalize('NFC').trim().replace(/\s+/g, ' '),
  };
}

export function validatePlotDraft(draft: PlotDraft, locale: UiLocale = 'en'): PlotDraftErrors {
  const normalized = normalizePlotDraft(draft);
  const errors: PlotDraftErrors = {};

  if (normalized.premise.length < 12) errors.premise = locale === 'vi' ? 'Thêm một chút bối cảnh cho câu chuyện.' : 'Give the story a little more context.';
  if (normalized.premise.length > 600) errors.premise = locale === 'vi' ? 'Giữ phần mở đầu dưới 600 ký tự.' : 'Keep the premise under 600 characters.';
  if (normalized.characterName.length < 2) errors.characterName = locale === 'vi' ? 'Nhập ít nhất 2 ký tự.' : 'Enter at least 2 characters.';
  if (normalized.characterName.length > 50) errors.characterName = locale === 'vi' ? 'Giữ tên nhân vật dưới 50 ký tự.' : 'Keep the character name under 50 characters.';

  return errors;
}

export function hasDraftErrors(errors: PlotDraftErrors): boolean {
  return Boolean(errors.premise || errors.characterName);
}
