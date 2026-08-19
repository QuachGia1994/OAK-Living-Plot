import { describe, expect, it } from 'vitest';
import { nextMediaPoll } from '../src/features/audio/media-polling';

describe('media polling policy', () => {
  it('only auto-polls observable in-flight product states', () => {
    expect(nextMediaPoll('queued', 0)).toEqual({ delayMs: 1_500 });
    expect(nextMediaPoll('processing', 1)).toEqual({ delayMs: 2_000 });
    expect(nextMediaPoll('ready', 0)).toBeNull();
    expect(nextMediaPoll('failed', 0)).toBeNull();
  });

  it('keeps polling through the server retry window, then stops at a bounded ceiling', () => {
    expect(nextMediaPoll('processing', 5)).toEqual({ delayMs: 8_000 });
    expect(nextMediaPoll('processing', 12)).toEqual({ delayMs: 30_000 });
    expect(nextMediaPoll('processing', 13)).toBeNull();
  });
});
