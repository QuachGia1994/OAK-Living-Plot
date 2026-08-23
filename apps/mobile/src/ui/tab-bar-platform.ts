export const iosNativeTabMinimizeBehavior = 'onScrollDown' as const;

export function usesNativeSystemTabs(platform: string): boolean {
  return platform === 'ios';
}
