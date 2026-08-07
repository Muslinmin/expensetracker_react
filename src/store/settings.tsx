import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { ThemeName } from '@/theme/tokens';

const PREFS_KEY = 'xpns.prefs.v1';
/** SecureStore keys may only contain alphanumerics, ".", "-" and "_". */
const SERVER_KEY = 'xpns_server_key';

export interface Prefs {
  name: string;
  theme: ThemeName;
  /**
   * Backend base URL, e.g. http://10.0.2.2:8000 from an Android emulator.
   * `localhost` resolves to the device itself, never the dev machine, so this
   * has to be configurable rather than compiled in.
   */
  apiBaseUrl: string;
  onboarded: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  name: '',
  theme: 'light',
  // 10.0.2.2 is the Android emulator's alias for the host loopback.
  apiBaseUrl: 'http://10.0.2.2:8000',
  onboarded: false,
};

interface SettingsValue {
  prefs: Prefs;
  /** The shared bearer secret. Kept out of `prefs` so it never lands in AsyncStorage. */
  serverKey: string;
  hydrated: boolean;
  setPrefs: (patch: Partial<Prefs>) => Promise<void>;
  setServerKey: (key: string) => Promise<void>;
  /** Wipes the key and un-onboards — used when the API answers 403. */
  clearCredentials: () => Promise<void>;
}

const SettingsContext = createContext<SettingsValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  const [serverKey, setServerKeyState] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [raw, key] = await Promise.all([
          AsyncStorage.getItem(PREFS_KEY),
          SecureStore.getItemAsync(SERVER_KEY).catch(() => null),
        ]);
        if (cancelled) return;
        if (raw) setPrefsState({ ...DEFAULT_PREFS, ...JSON.parse(raw) });
        if (key) setServerKeyState(key);
      } catch {
        // Corrupt storage shouldn't brick the app — fall through to defaults.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setPrefs = useCallback(async (patch: Partial<Prefs>) => {
    setPrefsState(prev => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const setServerKey = useCallback(async (key: string) => {
    setServerKeyState(key);
    await SecureStore.setItemAsync(SERVER_KEY, key).catch(() => {});
  }, []);

  const clearCredentials = useCallback(async () => {
    setServerKeyState('');
    await SecureStore.deleteItemAsync(SERVER_KEY).catch(() => {});
    setPrefsState(prev => {
      const next = { ...prev, onboarded: false };
      AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<SettingsValue>(
    () => ({ prefs, serverKey, hydrated, setPrefs, setServerKey, clearCredentials }),
    [prefs, serverKey, hydrated, setPrefs, setServerKey, clearCredentials],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}
