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
import { AuthProvider, useAuth } from '@/store/auth';
import { BudgetsProvider } from '@/store/budgets';
import { SettingsProvider, useSettings } from '@/store/settings';
import { AppThemeProvider, useTheme } from '@/theme/ThemeProvider';

// Hold the native splash until fonts and persisted settings are both ready.
// The scaffold faked this with a 28ms x 100 timer; there is real async work to
// wait on here, so the progress bar it drew has no honest equivalent.
SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigator() {
  const { hydrated, prefs } = useSettings();
  const { status, pendingRecoveryCode } = useAuth();
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

  // 'loading' covers both reading the stored session and the round-trip that
  // decides whether this account has key material — routing before that
  // resolves would flash the wrong screen, or worse, offer to set up a second
  // key over an existing one.
  const ready = hydrated && (fontsLoaded || !!fontError) && status !== 'loading';

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  // Route guard, in the order the states actually resolve: you cannot sign in
  // before the app knows which server to ask, and you cannot read a
  // transaction before the data key is unwrapped. 'locked' and 'no-keys' both
  // route to /login — it is the same screen, asking for the same password, for
  // different reasons.
  useEffect(() => {
    if (!ready) return;
    const route = segments[0];
    const onOnboarding = route === 'onboarding';
    const onLogin = route === 'login';
    // Not just 'ready': a freshly created key is 'ready' the moment it is
    // unwrapped, and navigating on that alone tore down the one and only
    // showing of the recovery code.
    const unlocked = status === 'ready' && !pendingRecoveryCode;

    if (!prefs.onboarded) {
      if (!onOnboarding) router.replace('/onboarding');
    } else if (!unlocked) {
      if (!onLogin) router.replace('/login');
    } else if (onOnboarding || onLogin) {
      router.replace('/');
    }
  }, [ready, prefs.onboarded, status, pendingRecoveryCode, segments, router]);

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
        <Stack.Screen name="login" options={{ gestureEnabled: false }} />
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
        {/* Inside SettingsProvider: the auth store reads apiBaseUrl from it to
            fetch key material. */}
        <AuthProvider>
          <AppThemeProvider>
            <QueryClientProvider client={queryClient}>
              <BudgetsProvider>
                <RootNavigator />
              </BudgetsProvider>
            </QueryClientProvider>
          </AppThemeProvider>
        </AuthProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
