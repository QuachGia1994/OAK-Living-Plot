import { describe, expect, it } from 'vitest';
import { dramaVisualCopyFor } from '../src/ui/drama-copy';

describe('dramaVisualCopyFor', () => {
  it('keeps cinematic interaction copy fully localized in Vietnamese', () => {
    const copy = dramaVisualCopyFor('vi');

    expect(copy.emptyKicker).toBe('CẢNH TIẾP THEO CỦA BẠN');
    expect(copy.sceneAdvanceCue).toBe('CHẠM CẢNH ĐỂ TIẾP TỤC');
    expect(copy.choiceAccessibility('B', 'Đối chất')).toBe('Lựa chọn B: Đối chất');
    expect(copy.sceneProgress(2, 4)).toBe('Nhịp cảnh 2 trên 4');
    expect(copy.consequenceHeadline).toContain('Lựa chọn');
  });

  it('keeps the English presentation copy stable', () => {
    const copy = dramaVisualCopyFor('en');

    expect(copy.generationKicker).toBe('DIRECTING YOUR DRAMA');
    expect(copy.choiceAccessibility('A', 'Call her back')).toBe('Choice A: Call her back');
    expect(copy.sceneProgress(1, 3)).toBe('Scene beat 1 of 3');
  });
});
