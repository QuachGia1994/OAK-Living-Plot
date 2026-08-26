import { describe, expect, it } from 'vitest';
import { artworkLegibility } from '../src/ui/artwork-legibility';

function alpha(value: string): number {
  const match = value.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\)$/u);
  if (!match) throw new Error(`Expected rgba color, received ${value}`);
  return Number(match[1]);
}

describe('artworkLegibility', () => {
  it('keeps narrative copy surfaces translucent enough to reveal Scene artwork', () => {
    expect(alpha(artworkLegibility.overlay.strong)).toBeLessThanOrEqual(0.6);
    expect(alpha(artworkLegibility.overlay.glass)).toBeLessThanOrEqual(0.36);
  });

  it('uses one shared shadow contract to retain text contrast over artwork', () => {
    expect(alpha(artworkLegibility.textShadow.textShadowColor)).toBeGreaterThanOrEqual(0.9);
    expect(artworkLegibility.textShadow.textShadowRadius).toBeGreaterThanOrEqual(4);
    expect(artworkLegibility.textShadow.textShadowOffset.height).toBeGreaterThan(0);
  });
});
