import { describe, expect, it } from 'vitest';
import { dramaDraftValidationSummary, hasDraftErrors, normalizeDramaDraft, validateDramaDraft } from '../src/features/drama/setup';

describe('drama setup contract', () => {
  it('normalizes user text to NFC and trims repeated whitespace', () => {
    const normalized = normalizeDramaDraft({
      premise: '  A  message  appears after midnight.  ',
      mood: 'mysterious',
      characterName: '  Mi\u0301nh  ',
    });

    expect(normalized.premise).toBe('A message appears after midnight.');
    expect(normalized.characterName).toBe('Mính');
    expect(normalized.characterName).toBe(normalized.characterName.normalize('NFC'));
  });

  it('rejects an underspecified premise and lead before generation', () => {
    const errors = validateDramaDraft({ premise: 'Too short', mood: 'tense', characterName: 'A' });
    expect(errors.premise).toBeTruthy();
    expect(errors.characterName).toBeTruthy();
    expect(hasDraftErrors(errors)).toBe(true);
  });

  it('returns a visible localized submit summary when local validation blocks generation', () => {
    const errors = validateDramaDraft({ premise: '', mood: 'tense', characterName: '' }, 'vi');
    expect(dramaDraftValidationSummary(errors, 'vi')).toBe('Hoàn tất mầm drama và tên nhân vật trước khi tạo cảnh 1.');
    expect(dramaDraftValidationSummary({}, 'vi')).toBeNull();
  });

  it('accepts the minimal drama setup', () => {
    const errors = validateDramaDraft({
      premise: 'A nurse receives tomorrow’s emergency call one night early.',
      mood: 'tense',
      characterName: 'Lan',
    });
    expect(errors).toEqual({});
    expect(hasDraftErrors(errors)).toBe(false);
  });
});
