import { describe, expect, it } from 'vitest';
import { buildSpoilerSafeShareText } from '../src/features/share/story-share';

describe('spoiler-safe story share copy', () => {
  it('is bounded and only uses the explicit public hook fields', () => {
    const text = buildSpoilerSafeShareText({
      title: 'The Midnight Message',
      episodeNumber: 4,
      premise: 'Mina receives a message from someone who should not be able to contact her. '.repeat(8),
    });

    expect(text.length).toBeLessThanOrEqual(320);
    expect(text).toContain('The Midnight Message');
    expect(text).toContain('Episode 4');
    expect(text).toContain('Living Plot');
    expect(text).not.toContain('choice-');
    expect(text).not.toContain('Bearer');
  });
});
