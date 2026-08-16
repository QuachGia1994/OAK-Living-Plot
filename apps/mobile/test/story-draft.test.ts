import { describe, expect, it } from 'vitest';
import { hasDraftErrors, normalizePlotDraft, validatePlotDraft } from '../src/features/story/draft';

describe('plot setup contract', () => {
  it('normalizes user text to NFC and trims repeated whitespace', () => {
    const normalized = normalizePlotDraft({
      premise: '  A  message  appears after midnight.  ',
      mood: 'mysterious',
      characterName: '  Mi\u0301nh  ',
    });

    expect(normalized.premise).toBe('A message appears after midnight.');
    expect(normalized.characterName).toBe('Mính');
    expect(normalized.characterName).toBe(normalized.characterName.normalize('NFC'));
  });

  it('rejects an underspecified premise and character before generation', () => {
    const errors = validatePlotDraft({ premise: 'Too short', mood: 'tense', characterName: 'A' });

    expect(errors.premise).toBeTruthy();
    expect(errors.characterName).toBeTruthy();
    expect(hasDraftErrors(errors)).toBe(true);
  });

  it('accepts the three-decision minimal setup', () => {
    const errors = validatePlotDraft({
      premise: 'A nurse receives tomorrow’s emergency call one night early.',
      mood: 'tense',
      characterName: 'Lan',
    });

    expect(errors).toEqual({});
    expect(hasDraftErrors(errors)).toBe(false);
  });
});
