import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { EpisodeAudioClientProvider } from '@/features/audio/audio-client-context';
import { AuthenticatedRuntimeProvider } from '@/features/auth/authenticated-runtime-provider';
import { MobileAuthProvider } from '@/features/auth/mobile-auth-context';
import { colors } from '@/ui/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <MobileAuthProvider>
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
      </MobileAuthProvider>
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
