import { describe, expect, it } from 'vitest';
import { shouldRefreshOnAppState } from '../src/lib/app-state-policy';

describe('foreground refresh policy', () => {
  it('refreshes only when returning to active state', () => {
    expect(shouldRefreshOnAppState('background', 'active')).toBe(true);
    expect(shouldRefreshOnAppState('inactive', 'active')).toBe(true);
    expect(shouldRefreshOnAppState('active', 'active')).toBe(false);
    expect(shouldRefreshOnAppState('active', 'background')).toBe(false);
  });
});
