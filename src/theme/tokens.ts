/**
 * Design tokens transcribed 1:1 from the Figma scaffold's `src/styles/theme.css`.
 * The web scaffold drove these through CSS custom properties and a `.dark` class
 * on <html>; React Native has neither, so they live here as plain objects and
 * reach components through ThemeProvider.
 */

export type ThemeName = 'light' | 'dark';

export interface Palette {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  inputBackground: string;
  switchBackground: string;
  ring: string;
  /** Positive money / under-budget affordances. Not in the CSS; added for RN. */
  success: string;
  /** 80%-of-budget warning state, matches the scaffold's inline amber. */
  warning: string;
}

const light: Palette = {
  background: '#ffffff',
  foreground: '#0A0B0F',
  card: '#F7F8FA',
  cardForeground: '#0A0B0F',
  popover: '#ffffff',
  popoverForeground: '#0A0B0F',
  primary: '#2563EB',
  primaryForeground: '#ffffff',
  secondary: '#EEF2FB',
  secondaryForeground: '#0A0B0F',
  muted: '#F0F1F5',
  mutedForeground: '#6B7280',
  accent: '#DBEAFE',
  accentForeground: '#1E40AF',
  destructive: '#DC2626',
  destructiveForeground: '#ffffff',
  border: 'rgba(10, 11, 15, 0.08)',
  inputBackground: '#F0F1F5',
  switchBackground: '#CBD5E1',
  ring: '#2563EB',
  success: '#059669',
  warning: '#F59E0B',
};

const dark: Palette = {
  background: '#0D0E13',
  foreground: '#E8E9EF',
  card: '#13151C',
  cardForeground: '#E8E9EF',
  popover: '#13151C',
  popoverForeground: '#E8E9EF',
  primary: '#3B82F6',
  primaryForeground: '#ffffff',
  secondary: '#1C2030',
  secondaryForeground: '#E8E9EF',
  muted: '#1C2030',
  mutedForeground: '#8B92A5',
  accent: '#1E2D50',
  accentForeground: '#93BBFD',
  destructive: '#EF4444',
  destructiveForeground: '#ffffff',
  border: 'rgba(232, 233, 239, 0.08)',
  inputBackground: '#1C2030',
  switchBackground: '#374151',
  ring: '#3B82F6',
  success: '#10B981',
  warning: '#F59E0B',
};

export const palettes: Record<ThemeName, Palette> = { light, dark };

/**
 * Category colours. The backend taxonomy is dynamic, so these are a palette to
 * hash into (see lib/categoryColor.ts) rather than a name->colour map.
 * Seeded from the scaffold's --chart-1..5 and extended to 12 so a realistic
 * taxonomy doesn't wrap and collide immediately.
 */
export const categoryPalette = [
  '#2563EB', // chart-1
  '#10B981', // chart-2
  '#F59E0B', // chart-3
  '#EF4444', // chart-4
  '#8B5CF6', // chart-5
  '#EC4899',
  '#06B6D4',
  '#84CC16',
  '#F97316',
  '#6366F1',
  '#14B8A6',
  '#A855F7',
] as const;

/** The scaffold used a 4px grid throughout (p-4, gap-3, py-2.5...). */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const font = {
  sans: 'Jost_400Regular',
  sansMedium: 'Jost_500Medium',
  sansSemiBold: 'Jost_600SemiBold',
  sansBold: 'Jost_700Bold',
  mono: 'DMMono_400Regular',
  monoMedium: 'DMMono_500Medium',
} as const;

/**
 * Money and any other figure that changes in place must not reflow.
 * The web scaffold got this from Tailwind's `tabular-nums`, which NativeWind
 * does not translate — RN needs the fontVariant explicitly.
 */
export const tabularNums = { fontVariant: ['tabular-nums' as const] };

/** The scaffold is deliberately square — `--radius: 0.25rem` and mostly unused. */
export const radius = { none: 0, sm: 2, md: 4 } as const;
