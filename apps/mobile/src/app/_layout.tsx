import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SceneVoiceClientProvider } from '@/features/audio/audio-client-context';
import { AuthenticatedRuntimeProvider } from '@/features/auth/authenticated-runtime-provider';
import { MobileAuthProvider } from '@/features/auth/mobile-auth-context';
import { useUserPreferences, UserPreferencesProvider } from '@/features/preferences/preferences-context';
import { AppErrorBoundary } from '@/ui/app-error-boundary';
import { colors } from '@/ui/theme';

const livingPlotDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.background,
    card: colors.surface,
    text: colors.ink,
    border: colors.borderSubtle,
    notification: colors.accentStrong,
  },
};

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
          <ThemeProvider value={livingPlotDarkTheme}>
            <Stack
              screenOptions={{
                headerShown: false,
                animation: 'fade',
                contentStyle: { backgroundColor: colors.background },
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="drama" />
              <Stack.Screen name="history" />
              <Stack.Screen name="plus" />
              <Stack.Screen name="auth" />
            </Stack>
          </ThemeProvider>
        </SceneVoiceClientProvider>
      </AuthenticatedRuntimeProvider>
    </AppErrorBoundary>
  );
}
