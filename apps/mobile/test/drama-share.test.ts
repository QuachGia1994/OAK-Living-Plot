import { describe, expect, it } from 'vitest';
import { buildSpoilerSafeDramaShareText } from '../src/features/share/drama-share';

describe('spoiler-safe drama share copy', () => {
  it('is bounded and only uses the explicit public hook fields', () => {
    const text = buildSpoilerSafeDramaShareText({
      title: 'The Midnight Message',
      sceneNumber: 4,
      premise: 'Mina receives a message from someone who should not be able to contact her. '.repeat(8),
      uiLocale: 'en',
    });

    expect(text.length).toBeLessThanOrEqual(320);
    expect(text).toContain('The Midnight Message');
    expect(text).toContain('Scene 4');
    expect(text).toContain('Living Plot');
    expect(text).not.toContain('choice-');
    expect(text).not.toContain('Bearer');
  });

  it('uses Vietnamese canonical terminology when UI locale is Vietnamese', () => {
    const text = buildSpoilerSafeDramaShareText({
      title: 'Tin Nhắn Lúc Nửa Đêm',
      sceneNumber: 2,
      premise: 'Mina nhận được một tin nhắn không thể tồn tại.',
      uiLocale: 'vi',
    });

    expect(text).toContain('Cảnh 2');
    expect(text).toContain('Mở đầu:');
    expect(text).not.toContain('Episode');
  });
});
