import { describe, expect, it } from 'vitest';
import {
  ANDROID_TAB_ROUTES,
  initialAndroidTabBarScrollState,
  nextAndroidTabBarScrollState,
} from '../src/ui/android-tab-bar-state';

describe('Android compact tab bar scroll controller', () => {
  it('preserves exactly the four top-level routes', () => {
    expect(ANDROID_TAB_ROUTES).toEqual(['index', 'create', 'library', 'settings']);
  });

  it('stays expanded near the top and through small jitter', () => {
    let state = initialAndroidTabBarScrollState;
    for (const y of [0, 2, 5, 9, 11, 10, 12, 13]) state = nextAndroidTabBarScrollState(state, y);
    expect(state.compact).toBe(false);
  });

  it('compacts only after meaningful sustained downward travel away from the top', () => {
    let state = initialAndroidTabBarScrollState;
    for (const y of [6, 16, 25, 34, 44]) state = nextAndroidTabBarScrollState(state, y);
    expect(state.compact).toBe(true);
  });

  it('expands after meaningful upward travel', () => {
    let state = initialAndroidTabBarScrollState;
    for (const y of [10, 22, 34, 48]) state = nextAndroidTabBarScrollState(state, y);
    expect(state.compact).toBe(true);
    for (const y of [44, 38, 31, 26]) state = nextAndroidTabBarScrollState(state, y);
    expect(state.compact).toBe(false);
  });

  it('always expands again when content returns to the top', () => {
    let state = initialAndroidTabBarScrollState;
    for (const y of [12, 24, 38, 50]) state = nextAndroidTabBarScrollState(state, y);
    expect(state.compact).toBe(true);
    state = nextAndroidTabBarScrollState(state, 4);
    expect(state).toMatchObject({ compact: false, lastY: 4, direction: null, travel: 0 });
  });

  it('ignores non-finite offsets instead of corrupting compact state', () => {
    const compact = { ...initialAndroidTabBarScrollState, compact: true, lastY: 60 };
    expect(nextAndroidTabBarScrollState(compact, Number.NaN).compact).toBe(true);
  });
});
