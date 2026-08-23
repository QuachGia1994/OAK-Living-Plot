import { describe, expect, it } from 'vitest';
import { iosNativeTabMinimizeBehavior, usesNativeSystemTabs } from '../src/ui/tab-bar-platform';

describe('platform tab-bar contract', () => {
  it('always reserves iOS for the native system tab bar', () => {
    expect(usesNativeSystemTabs('ios')).toBe(true);
    expect(usesNativeSystemTabs('android')).toBe(false);
    expect(usesNativeSystemTabs('web')).toBe(false);
  });

  it('keeps the iOS 26 native collapse-on-scroll behavior', () => {
    expect(iosNativeTabMinimizeBehavior).toBe('onScrollDown');
  });
});
