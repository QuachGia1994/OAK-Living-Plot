import { useEffect } from 'react';
import { DynamicColorIOS, Platform } from 'react-native';
import { Tabs, usePathname } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useUserPreferences } from '@/features/preferences/preferences-context';
import { AndroidLivingPlotTabBar } from '@/ui/android-living-plot-tab-bar';
import { AndroidTabBarStateProvider, useAndroidTabBarState } from '@/ui/android-tab-bar-state';
import { iosNativeTabMinimizeBehavior, usesNativeSystemTabs } from '@/ui/tab-bar-platform';
import { colors } from '@/ui/theme';

const iosTint = Platform.OS === 'ios'
  ? DynamicColorIOS({ dark: colors.accentStrong, light: colors.accentSoft })
  : colors.accentStrong;
const iosLabel = Platform.OS === 'ios'
  ? DynamicColorIOS({ dark: colors.ink, light: colors.accentInk })
  : colors.inkMuted;

export default function TabsLayout() {
  if (!usesNativeSystemTabs(Platform.OS)) {
    return (
      <AndroidTabBarStateProvider>
        <AndroidTabs />
      </AndroidTabBarStateProvider>
    );
  }
  return <IosNativeTabs />;
}

function AndroidTabs() {
  const { preferences } = useUserPreferences();
  const vi = preferences.uiLocale === 'vi';
  const pathname = usePathname();
  const tabBar = useAndroidTabBarState();
  const compact = tabBar?.compact ?? false;
  const resetTabBar = tabBar?.reset;

  useEffect(() => {
    resetTabBar?.();
  }, [pathname, resetTabBar]);

  return (
    <Tabs
      backBehavior="history"
      tabBar={(props) => <AndroidLivingPlotTabBar {...props} compact={compact} />}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen name="index" options={{ title: vi ? 'Trang chủ' : 'Home', tabBarAccessibilityLabel: vi ? 'Trang chủ' : 'Home' }} />
      <Tabs.Screen name="create" options={{ title: vi ? 'Tạo' : 'Create', tabBarAccessibilityLabel: vi ? 'Tạo drama' : 'Create drama' }} />
      <Tabs.Screen name="library" options={{ title: vi ? 'Thư viện' : 'Library', tabBarAccessibilityLabel: vi ? 'Thư viện' : 'Library' }} />
      <Tabs.Screen name="settings" options={{ title: vi ? 'Cài đặt' : 'Settings', tabBarAccessibilityLabel: vi ? 'Cài đặt' : 'Settings' }} />
    </Tabs>
  );
}

function IosNativeTabs() {
  const { preferences } = useUserPreferences();
  const vi = preferences.uiLocale === 'vi';
  return (
    <NativeTabs tintColor={iosTint} labelStyle={{ color: iosLabel }} minimizeBehavior={iosNativeTabMinimizeBehavior}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <NativeTabs.Trigger.Label>{vi ? 'Trang chủ' : 'Home'}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="create">
        <NativeTabs.Trigger.Icon sf={{ default: 'plus.circle', selected: 'plus.circle.fill' }} />
        <NativeTabs.Trigger.Label>{vi ? 'Tạo' : 'Create'}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="library">
        <NativeTabs.Trigger.Icon sf={{ default: 'rectangle.stack', selected: 'rectangle.stack.fill' }} />
        <NativeTabs.Trigger.Label>{vi ? 'Thư viện' : 'Library'}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} />
        <NativeTabs.Trigger.Label>{vi ? 'Cài đặt' : 'Settings'}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
