import { describe, expect, it } from 'vitest';
import {
  ANDROID_MINI_NAV_METRICS,
  ANDROID_TAB_GLYPHS,
  ANDROID_TAB_ROUTES,
  androidMiniRailWidth,
} from '../src/ui/android-tab-bar-state';

describe('Android Living Plot mini tab bar', () => {
  it('keeps the canonical four route glyph mappings', () => {
    expect(Object.keys(ANDROID_TAB_GLYPHS)).toEqual([...ANDROID_TAB_ROUTES]);
  });

  it('uses a true mini rail footprint with accessible tap targets', () => {
    expect(ANDROID_MINI_NAV_METRICS.compactRailHeight).toBeGreaterThanOrEqual(44);
    expect(ANDROID_MINI_NAV_METRICS.compactRailHeight).toBeLessThanOrEqual(48);
    expect(ANDROID_MINI_NAV_METRICS.compactRailMaxWidth).toBeGreaterThanOrEqual(220);
    expect(ANDROID_MINI_NAV_METRICS.compactRailMaxWidth).toBeLessThanOrEqual(260);
    expect(ANDROID_MINI_NAV_METRICS.minimumTapTarget).toBeGreaterThanOrEqual(44);
  });

  it('centers a bounded responsive rail instead of retaining full-screen width', () => {
    expect(androidMiniRailWidth(420)).toBe(248);
    expect(androidMiniRailWidth(320)).toBe(248);
    expect(androidMiniRailWidth(210)).toBe(176);
  });
});
