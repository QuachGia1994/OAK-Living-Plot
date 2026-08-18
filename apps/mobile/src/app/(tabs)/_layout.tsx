import { DynamicColorIOS, Platform } from 'react-native';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useUserPreferences } from '@/features/preferences/preferences-context';
import { colors } from '@/ui/theme';

const tint = Platform.OS === 'ios'
  ? DynamicColorIOS({ dark: colors.accentStrong, light: colors.accentSoft })
  : colors.accentStrong;

const labelColor = Platform.OS === 'ios'
  ? DynamicColorIOS({ dark: colors.ink, light: colors.accentInk })
  : colors.inkMuted;

export default function TabsLayout() {
  const { preferences } = useUserPreferences();
  const vi = preferences.uiLocale === 'vi';

  return (
    <NativeTabs
      tintColor={tint}
      labelStyle={{ color: labelColor }}
      minimizeBehavior={Platform.OS === 'ios' ? 'onScrollDown' : undefined}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
        <NativeTabs.Trigger.Label>{vi ? 'Trang chủ' : 'Home'}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="create">
        <NativeTabs.Trigger.Icon sf={{ default: 'plus.circle', selected: 'plus.circle.fill' }} md="add_circle" />
        <NativeTabs.Trigger.Label>{vi ? 'Tạo' : 'Create'}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="library">
        <NativeTabs.Trigger.Icon sf={{ default: 'rectangle.stack', selected: 'rectangle.stack.fill' }} md="library_books" />
        <NativeTabs.Trigger.Label>{vi ? 'Thư viện' : 'Library'}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} md="settings" />
        <NativeTabs.Trigger.Label>{vi ? 'Cài đặt' : 'Settings'}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
