import { useEffect } from 'react';
import { DynamicColorIOS, Platform, StyleSheet, Text, type ColorValue } from 'react-native';
import { Tabs, usePathname } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useUserPreferences } from '@/features/preferences/preferences-context';
import { AndroidTabBarStateProvider, useAndroidTabBarState } from '@/ui/android-tab-bar-state';
import { colors, typography } from '@/ui/theme';

const iosTint = Platform.OS === 'ios'
  ? DynamicColorIOS({ dark: colors.accentStrong, light: colors.accentSoft })
  : colors.accentStrong;
const iosLabel = Platform.OS === 'ios'
  ? DynamicColorIOS({ dark: colors.ink, light: colors.accentInk })
  : colors.inkMuted;

export default function TabsLayout() {
  if (Platform.OS === 'android') {
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
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accentStrong,
        tabBarInactiveTintColor: colors.quietInk,
        tabBarActiveBackgroundColor: colors.surfaceAccentPill,
        tabBarInactiveBackgroundColor: colors.background,
        tabBarHideOnKeyboard: true,
        tabBarShowLabel: !compact,
        tabBarLabelPosition: 'below-icon',
        tabBarLabelStyle: styles.androidLabel,
        tabBarItemStyle: compact ? styles.androidItemCompact : styles.androidItem,
        tabBarStyle: compact ? styles.androidBarCompact : styles.androidBar,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: vi ? 'Trang chủ' : 'Home',
          tabBarAccessibilityLabel: vi ? 'Trang chủ' : 'Home',
          tabBarIcon: ({ color }) => <AndroidTabGlyph glyph="⌂" color={color} />,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: vi ? 'Tạo' : 'Create',
          tabBarAccessibilityLabel: vi ? 'Tạo drama' : 'Create drama',
          tabBarIcon: ({ color }) => <AndroidTabGlyph glyph="＋" color={color} />,
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: vi ? 'Thư viện' : 'Library',
          tabBarAccessibilityLabel: vi ? 'Thư viện' : 'Library',
          tabBarIcon: ({ color }) => <AndroidTabGlyph glyph="▤" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: vi ? 'Cài đặt' : 'Settings',
          tabBarAccessibilityLabel: vi ? 'Cài đặt' : 'Settings',
          tabBarIcon: ({ color }) => <AndroidTabGlyph glyph="⚙" color={color} />,
        }}
      />
    </Tabs>
  );
}

function AndroidTabGlyph({ glyph, color }: { glyph: string; color: ColorValue }) {
  return <Text importantForAccessibility="no" style={[styles.androidGlyph, { color }]}>{glyph}</Text>;
}

function IosNativeTabs() {
  const { preferences } = useUserPreferences();
  const vi = preferences.uiLocale === 'vi';
  return (
    <NativeTabs
      tintColor={iosTint}
      labelStyle={{ color: iosLabel }}
      minimizeBehavior="onScrollDown"
    >
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

const styles = StyleSheet.create({
  androidBar: {
    height: 68,
    paddingTop: 5,
    paddingBottom: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
    backgroundColor: colors.background,
  },
  androidBarCompact: {
    height: 50,
    paddingTop: 1,
    paddingBottom: 1,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
    backgroundColor: colors.background,
  },
  androidItem: { minHeight: 56, marginHorizontal: 4, marginVertical: 3, borderRadius: 18 },
  androidItemCompact: { minHeight: 44, marginHorizontal: 4, marginVertical: 3, borderRadius: 16 },
  androidLabel: {
    fontFamily: typography.mono,
    fontSize: 10,
    fontWeight: '700',
  },
  androidGlyph: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '700',
  },
});
