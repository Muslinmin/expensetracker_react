import {
  DMMono_400Regular,
  DMMono_500Medium,
} from '@expo-google-fonts/dm-mono';
import {
  Jost_400Regular,
  Jost_500Medium,
  Jost_600SemiBold,
  Jost_700Bold,
} from '@expo-google-fonts/jost';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient } from '@/lib/api/queryClient';
import { SettingsProvider, useSettings } from '@/store/settings';
import { AppThemeProvider, useTheme } from '@/theme/ThemeProvider';

// Hold the native splash until fonts and persisted settings are both ready.
// The scaffold faked this with a 28ms x 100 timer; there is real async work to
// wait on here, so the progress bar it drew has no honest equivalent.
SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigator() {
  const { hydrated, prefs } = useSettings();
  const { c, name } = useTheme();
  const router = useRouter();
  const segments = useSegments();

  const [fontsLoaded, fontError] = useFonts({
    Jost_400Regular,
    Jost_500Medium,
    Jost_600SemiBold,
    Jost_700Bold,
    DMMono_400Regular,
    DMMono_500Medium,
  });

  const ready = hydrated && (fontsLoaded || !!fontError);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  // Route guard: an un-onboarded user can never reach the tabs, and an
  // onboarded one never sees onboarding again.
  useEffect(() => {
    if (!ready) return;
    const onOnboarding = segments[0] === 'onboarding';
    if (!prefs.onboarded && !onOnboarding) {
      router.replace('/onboarding');
    } else if (prefs.onboarded && onOnboarding) {
      router.replace('/');
    }
  }, [ready, prefs.onboarded, segments, router]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: c.background }} />;

  return (
    <>
      <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.background },
        }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="import" options={{ presentation: 'modal' }} />
        <Stack.Screen name="categories" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <AppThemeProvider>
          <QueryClientProvider client={queryClient}>
            <RootNavigator />
          </QueryClientProvider>
        </AppThemeProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
