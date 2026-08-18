import { describe, expect, it } from 'vitest';
import { localize, sharedUiCopy } from '../src/features/localization/copy';
import { dramaMoodOptionsFor, validateDramaDraft } from '../src/features/drama/setup';

describe('mobile localization', () => {
  it('selects shared copy from the saved UI locale contract', () => {
    expect(localize('en', sharedUiCopy.cancel)).toBe('Cancel');
    expect(localize('vi', sharedUiCopy.cancel)).toBe('Hủy');
  });

  it('localizes drama setup choices without changing canonical mood keys', () => {
    expect(dramaMoodOptionsFor('en').map((item) => item.value)).toEqual(['tense', 'romantic', 'mysterious', 'hopeful']);
    expect(dramaMoodOptionsFor('vi').map((item) => item.value)).toEqual(['tense', 'romantic', 'mysterious', 'hopeful']);
    expect(dramaMoodOptionsFor('vi')[0]?.label).toBe('Căng thẳng');
  });

  it('localizes validation messages while preserving validation behavior', () => {
    const draft = { premise: 'Too short', mood: 'tense' as const, characterName: 'A' };
    expect(validateDramaDraft(draft, 'en').premise).toBe('Give the drama a little more context.');
    expect(validateDramaDraft(draft, 'vi').premise).toBe('Thêm một chút bối cảnh cho drama.');
  });
});
