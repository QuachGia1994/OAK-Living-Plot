import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SceneVoiceClientProvider } from '@/features/audio/audio-client-context';
import { AuthenticatedRuntimeProvider } from '@/features/auth/authenticated-runtime-provider';
import { MobileAuthProvider } from '@/features/auth/mobile-auth-context';
import { useUserPreferences, UserPreferencesProvider } from '@/features/preferences/preferences-context';
import { AppErrorBoundary } from '@/ui/app-error-boundary';
import { colors } from '@/ui/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <MobileAuthProvider>
        <UserPreferencesProvider>
          <LocalizedRuntime />
        </UserPreferencesProvider>
      </MobileAuthProvider>
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}

function LocalizedRuntime() {
  const { preferences } = useUserPreferences();
  return (
    <AppErrorBoundary locale={preferences.uiLocale}>
      <AuthenticatedRuntimeProvider>
        <SceneVoiceClientProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'fade',
              contentStyle: { backgroundColor: colors.background },
            }}
          />
        </SceneVoiceClientProvider>
      </AuthenticatedRuntimeProvider>
    </AppErrorBoundary>
  );
}
