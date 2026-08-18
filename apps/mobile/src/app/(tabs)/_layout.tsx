import { DynamicColorIOS, Platform } from 'react-native';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useUserPreferences } from '@/features/preferences/preferences-context';
import { colors } from '@/ui/theme';

const iosTint = DynamicColorIOS({ dark: colors.accentStrong, light: colors.accentSoft });
const iosLabel = DynamicColorIOS({ dark: colors.ink, light: colors.accentInk });

export default function TabsLayout() {
  const { preferences } = useUserPreferences();
  const vi = preferences.uiLocale === 'vi';

  if (Platform.OS === 'android') {
    return (
      <NativeTabs
        backgroundColor={colors.background}
        indicatorColor={colors.surfaceAccentPill}
        iconColor={{ default: colors.quietInk, selected: colors.accentStrong }}
        labelStyle={{
          default: { color: colors.quietInk, fontSize: 11, fontWeight: '600' },
          selected: { color: colors.accentStrong, fontSize: 11, fontWeight: '700' },
        }}
        tintColor={colors.accentStrong}
        rippleColor="rgba(240, 193, 125, 0.18)"
        labelVisibilityMode="labeled"
      >
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon md={{ default: 'home', selected: 'home' }} />
          <NativeTabs.Trigger.Label>{vi ? 'Trang chủ' : 'Home'}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="create">
          <NativeTabs.Trigger.Icon md={{ default: 'add_circle', selected: 'add_circle' }} />
          <NativeTabs.Trigger.Label>{vi ? 'Tạo' : 'Create'}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="library">
          <NativeTabs.Trigger.Icon md={{ default: 'library_books', selected: 'library_books' }} />
          <NativeTabs.Trigger.Label>{vi ? 'Thư viện' : 'Library'}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings">
          <NativeTabs.Trigger.Icon md={{ default: 'settings', selected: 'settings' }} />
          <NativeTabs.Trigger.Label>{vi ? 'Cài đặt' : 'Settings'}</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

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
