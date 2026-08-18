import { describe, expect, it } from 'vitest';
import { nextMediaPoll } from '../src/features/audio/media-polling';

describe('media polling policy', () => {
  it('only auto-polls observable in-flight product states', () => {
    expect(nextMediaPoll('queued', 0)).toEqual({ delayMs: 1_500 });
    expect(nextMediaPoll('processing', 1)).toEqual({ delayMs: 2_000 });
    expect(nextMediaPoll('ready', 0)).toBeNull();
    expect(nextMediaPoll('failed', 0)).toBeNull();
  });

  it('stops automatic polling after the bounded schedule', () => {
    expect(nextMediaPoll('processing', 5)).toEqual({ delayMs: 5_000 });
    expect(nextMediaPoll('processing', 6)).toBeNull();
  });
});
