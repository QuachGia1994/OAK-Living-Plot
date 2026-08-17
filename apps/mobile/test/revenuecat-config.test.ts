import { describe, expect, it } from 'vitest';
import { resolveRevenueCatConfig } from '../src/features/billing/revenuecat-config';

describe('RevenueCat public store configuration', () => {
  it('prefers Test Store on both mobile platforms when configured', () => {
    const keys = { testStore: 'test_key', ios: 'appl_key', android: 'goog_key' };
    expect(resolveRevenueCatConfig('ios', keys)).toEqual({ apiKey: 'test_key', mode: 'test_store' });
    expect(resolveRevenueCatConfig('android', keys)).toEqual({ apiKey: 'test_key', mode: 'test_store' });
  });

  it('falls back to the platform store and reports an explicit unconfigured state', () => {
    expect(resolveRevenueCatConfig('ios', { testStore: '', ios: 'appl_key', android: '' })).toEqual({
      apiKey: 'appl_key',
      mode: 'platform_store',
    });
    expect(resolveRevenueCatConfig('android', { testStore: '', ios: '', android: '' })).toEqual({
      apiKey: '',
      mode: 'not_configured',
    });
  });
});
