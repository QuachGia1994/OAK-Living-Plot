import { describe, expect, it } from 'vitest';
import { localize, sharedUiCopy } from '../src/features/localization/ui-copy';
import { storyMoodOptionsFor, validatePlotDraft } from '../src/features/story/draft';

describe('mobile localization', () => {
  it('selects shared copy from the saved UI locale contract', () => {
    expect(localize('en', sharedUiCopy.cancel)).toBe('Cancel');
    expect(localize('vi', sharedUiCopy.cancel)).toBe('Hủy');
  });

  it('localizes story setup choices without changing canonical mood keys', () => {
    expect(storyMoodOptionsFor('en').map((item) => item.value)).toEqual(['tense', 'romantic', 'mysterious', 'hopeful']);
    expect(storyMoodOptionsFor('vi').map((item) => item.value)).toEqual(['tense', 'romantic', 'mysterious', 'hopeful']);
    expect(storyMoodOptionsFor('vi')[0]?.label).toBe('Căng thẳng');
  });

  it('localizes validation messages while preserving validation behavior', () => {
    const draft = { premise: 'Too short', mood: 'tense' as const, characterName: 'A' };
    expect(validatePlotDraft(draft, 'en').premise).toBe('Give the story a little more context.');
    expect(validatePlotDraft(draft, 'vi').premise).toBe('Thêm một chút bối cảnh cho câu chuyện.');
  });
});
