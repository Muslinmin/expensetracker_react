import { createContext, useContext, useMemo } from 'react';

import { useSettings } from '@/store/settings';
import { type Palette, palettes, type ThemeName } from './tokens';

interface ThemeValue {
  name: ThemeName;
  c: Palette;
}

const ThemeContext = createContext<ThemeValue>({ name: 'light', c: palettes.light });

/**
 * Theme is an explicit user preference, not the OS scheme — the scaffold's
 * onboarding and Settings both present light/dark as a choice, so we honour
 * that rather than following `useColorScheme()`.
 */
export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const { prefs } = useSettings();
  const value = useMemo(
    () => ({ name: prefs.theme, c: palettes[prefs.theme] }),
    [prefs.theme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** `const { c } = useTheme()` then `c.primary` — keeps style objects terse. */
export function useTheme() {
  return useContext(ThemeContext);
}
