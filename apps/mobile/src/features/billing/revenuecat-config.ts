export type RevenueCatPlatform = 'ios' | 'android';

export interface RevenueCatPublicKeys {
  testStore: string;
  ios: string;
  android: string;
}

export type RevenueCatStoreMode = 'test_store' | 'platform_store' | 'not_configured';

export interface RevenueCatResolvedConfig {
  apiKey: string;
  mode: RevenueCatStoreMode;
}

export function resolveRevenueCatConfig(
  platform: RevenueCatPlatform,
  keys: RevenueCatPublicKeys,
): RevenueCatResolvedConfig {
  const testStore = keys.testStore.trim();
  if (testStore) return { apiKey: testStore, mode: 'test_store' };
  const apiKey = (platform === 'ios' ? keys.ios : keys.android).trim();
  return apiKey ? { apiKey, mode: 'platform_store' } : { apiKey: '', mode: 'not_configured' };
}

export function revenueCatPublicKeysFromEnv(): RevenueCatPublicKeys {
  return {
    testStore: process.env.EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY ?? '',
    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? '',
    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? '',
  };
}

export function revenueCatStoreModeFromEnv(platform: RevenueCatPlatform): RevenueCatStoreMode {
  return resolveRevenueCatConfig(platform, revenueCatPublicKeysFromEnv()).mode;
}
