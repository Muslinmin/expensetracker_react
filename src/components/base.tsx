import { forwardRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  type TextProps,
  TextInput,
  type TextInputProps,
  View,
  type ViewProps,
} from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { font, space, tabularNums } from '@/theme/tokens';

/* ── Type ──────────────────────────────────────────────────────────────── */

type TextTone = 'default' | 'muted' | 'primary' | 'destructive' | 'success' | 'inverse';

interface TypeProps extends TextProps {
  tone?: TextTone;
  size?: number;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  /** Digits that must not reflow as values change. */
  numeric?: boolean;
}

function useTone(tone: TextTone = 'default') {
  const { c } = useTheme();
  return {
    default: c.foreground,
    muted: c.mutedForeground,
    primary: c.primary,
    destructive: c.destructive,
    success: c.success,
    inverse: c.primaryForeground,
  }[tone];
}

/** Jost — body copy, headings, anything the user reads as prose. */
export function Sans({ tone, size = 14, weight = 'regular', numeric, style, ...rest }: TypeProps) {
  const color = useTone(tone);
  const family = {
    regular: font.sans,
    medium: font.sansMedium,
    semibold: font.sansSemiBold,
    bold: font.sansBold,
  }[weight];
  return (
    <Text
      {...rest}
      style={[{ color, fontFamily: family, fontSize: size }, numeric && tabularNums, style]}
    />
  );
}

/** DM Mono — labels, dates, and every figure. */
export function Mono({ tone, size = 12, weight = 'regular', numeric = true, style, ...rest }: TypeProps) {
  const color = useTone(tone);
  const family = weight === 'regular' ? font.mono : font.monoMedium;
  return (
    <Text
      {...rest}
      style={[{ color, fontFamily: family, fontSize: size }, numeric && tabularNums, style]}
    />
  );
}

/** The uppercase tracked eyebrow used above every section in the design. */
export function Eyebrow({ children, style, ...rest }: TypeProps) {
  return (
    <Mono
      {...rest}
      size={10}
      tone="muted"
      numeric={false}
      style={[{ letterSpacing: 1.6, textTransform: 'uppercase' }, style]}>
      {children}
    </Mono>
  );
}

/* ── Surfaces ──────────────────────────────────────────────────────────── */

export function Card({ style, ...rest }: ViewProps) {
  const { c } = useTheme();
  return (
    <View
      {...rest}
      style={[
        { backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, padding: space.lg },
        style,
      ]}
    />
  );
}

export function Divider({ style }: ViewProps) {
  const { c } = useTheme();
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }, style]} />;
}

/* ── Controls ──────────────────────────────────────────────────────────── */

interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  title: string;
  variant?: 'primary' | 'outline' | 'danger' | 'success';
  loading?: boolean;
  style?: ViewProps['style'];
}

export function Button({ title, variant = 'primary', loading, disabled, style, ...rest }: ButtonProps) {
  const { c } = useTheme();
  const inactive = disabled || loading;

  const bg = { primary: c.primary, outline: 'transparent', danger: c.destructive, success: c.success }[variant];
  const fg = variant === 'outline' ? c.mutedForeground : c.primaryForeground;

  return (
    <Pressable
      {...rest}
      disabled={inactive}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderWidth: variant === 'outline' ? StyleSheet.hairlineWidth : 0,
          borderColor: c.border,
          paddingVertical: 14,
          paddingHorizontal: space.lg,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: space.sm,
          // No hover on touch — pressed state is the only affordance there is.
          opacity: inactive ? 0.5 : pressed ? 0.75 : 1,
        },
        style,
      ]}>
      {loading && <ActivityIndicator size="small" color={fg} />}
      <Sans weight="semibold" size={14} style={{ color: fg }}>
        {title}
      </Sans>
    </Pressable>
  );
}

interface FieldProps extends TextInputProps {
  label: string;
  error?: string;
  required?: boolean;
  /** Renders a trailing slot, e.g. the show/hide eye on secret fields. */
  accessory?: React.ReactNode;
}

/**
 * Defined at module scope on purpose. The web scaffold declared its `Field`
 * inside the render body of both the onboarding and settings screens, so every
 * keystroke produced a new component type, remounting the input and dropping
 * focus — on mobile that also dismisses the keyboard on each character.
 */
export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, error, required, accessory, style, ...rest },
  ref,
) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Eyebrow>
        {label}
        {required ? <Mono tone="destructive" numeric={false}> *</Mono> : null}
      </Eyebrow>
      <View style={{ justifyContent: 'center' }}>
        <TextInput
          ref={ref}
          placeholderTextColor={c.mutedForeground}
          {...rest}
          style={[
            {
              backgroundColor: c.inputBackground,
              color: c.foreground,
              borderWidth: 1,
              borderColor: error ? c.destructive : 'transparent',
              paddingHorizontal: space.md,
              paddingVertical: 12,
              paddingRight: accessory ? 44 : space.md,
              fontFamily: font.mono,
              fontSize: 13,
            },
            style,
          ]}
        />
        {accessory ? <View style={{ position: 'absolute', right: space.md }}>{accessory}</View> : null}
      </View>
      {error ? (
        <Mono tone="destructive" size={11} numeric={false}>
          {error}
        </Mono>
      ) : null}
    </View>
  );
});

/* ── States ───────────────────────────────────────────────────────────── */

export function Loading({ label }: { label?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ padding: space.xxl, alignItems: 'center', gap: space.md }}>
      <ActivityIndicator color={c.primary} />
      {label ? <Mono tone="muted" numeric={false}>{label}</Mono> : null}
    </View>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={{ padding: space.xxl, alignItems: 'center', gap: space.sm }}>
      <Sans tone="muted">{title}</Sans>
      {hint ? (
        <Sans tone="muted" size={12} style={{ textAlign: 'center' }}>
          {hint}
        </Sans>
      ) : null}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong';
  return (
    <View style={{ padding: space.xl, alignItems: 'center', gap: space.md }}>
      <Sans tone="destructive" weight="medium" style={{ textAlign: 'center' }}>
        {message}
      </Sans>
      {onRetry ? <Button title="Retry" variant="outline" onPress={onRetry} /> : null}
    </View>
  );
}
