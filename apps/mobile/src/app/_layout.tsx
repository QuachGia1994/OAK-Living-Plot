import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { EpisodeAudioClientProvider } from '@/features/audio/audio-client-context';
import { AuthenticatedRuntimeProvider } from '@/features/auth/authenticated-runtime-provider';
import { MobileAuthProvider } from '@/features/auth/mobile-auth-context';
import { UserPreferencesProvider } from '@/features/preferences/preferences-context';
import { AppErrorBoundary } from '@/ui/app-error-boundary';
import { colors } from '@/ui/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppErrorBoundary>
        <MobileAuthProvider>
          <UserPreferencesProvider>
            <AuthenticatedRuntimeProvider>
              <EpisodeAudioClientProvider>
              <Stack
                screenOptions={{
                  headerShown: false,
                  animation: 'fade',
                  contentStyle: { backgroundColor: colors.background },
                }}
              />
              </EpisodeAudioClientProvider>
            </AuthenticatedRuntimeProvider>
          </UserPreferencesProvider>
        </MobileAuthProvider>
      </AppErrorBoundary>
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
