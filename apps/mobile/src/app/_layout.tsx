import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthenticatedRuntimeProvider } from '@/features/auth/authenticated-runtime-provider';
import { MobileAuthProvider } from '@/features/auth/mobile-auth-context';
import { colors } from '@/ui/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <MobileAuthProvider>
        <AuthenticatedRuntimeProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'fade',
              contentStyle: { backgroundColor: colors.background },
            }}
          />
        </AuthenticatedRuntimeProvider>
      </MobileAuthProvider>
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
