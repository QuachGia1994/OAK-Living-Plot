import type { PlotDraft, StoryMood } from './contracts';

export const storyMoodOptions: readonly { value: StoryMood; label: string; description: string }[] = [
  { value: 'tense', label: 'Tense', description: 'Secrets, pressure, hard choices' },
  { value: 'romantic', label: 'Romantic', description: 'Chemistry, vulnerability, longing' },
  { value: 'mysterious', label: 'Mysterious', description: 'Clues, doubt, hidden motives' },
  { value: 'hopeful', label: 'Hopeful', description: 'Second chances, courage, recovery' },
];

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

export function validatePlotDraft(draft: PlotDraft): PlotDraftErrors {
  const normalized = normalizePlotDraft(draft);
  const errors: PlotDraftErrors = {};

  if (normalized.premise.length < 12) errors.premise = 'Give the story a little more context.';
  if (normalized.premise.length > 600) errors.premise = 'Keep the premise under 600 characters.';
  if (normalized.characterName.length < 2) errors.characterName = 'Enter at least 2 characters.';
  if (normalized.characterName.length > 50) errors.characterName = 'Keep the character name under 50 characters.';

  return errors;
}

export function hasDraftErrors(errors: PlotDraftErrors): boolean {
  return Boolean(errors.premise || errors.characterName);
}
