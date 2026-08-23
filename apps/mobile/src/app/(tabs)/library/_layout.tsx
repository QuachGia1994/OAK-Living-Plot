import { Stack } from 'expo-router';
import { colors } from '@/ui/theme';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function LibraryStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="drama" options={{ gestureEnabled: false }} />
      <Stack.Screen name="character" />
      <Stack.Screen name="history" />
    </Stack>
  );
}
