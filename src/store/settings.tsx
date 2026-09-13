import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { ThemeName } from '@/theme/tokens';

const PREFS_KEY = 'xpns.prefs.v1';

/**
 * Credentials no longer live here. This holds only non-secret preferences —
 * name, theme, which backend to talk to. The Supabase session and the data key
 * are in `@/store/auth`, in the device keystore rather than AsyncStorage,
 * which is plain unencrypted files.
 */

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
  hydrated: boolean;
  setPrefs: (patch: Partial<Prefs>) => Promise<void>;
}

const SettingsContext = createContext<SettingsValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(PREFS_KEY);
        if (cancelled) return;
        if (raw) setPrefsState({ ...DEFAULT_PREFS, ...JSON.parse(raw) });
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

  const value = useMemo<SettingsValue>(
    () => ({ prefs, hydrated, setPrefs }),
    [prefs, hydrated, setPrefs],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}
