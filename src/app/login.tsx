/**
 * Sign in, sign up, and unlock.
 *
 * One screen for three states because they ask for the same two things and
 * differ only in what happens afterwards:
 *
 *   signed-out  email + password  -> authenticate, then unwrap the data key
 *   no-keys     password          -> first-time key setup for this account
 *   locked      password          -> re-derive the key for a session we have
 *
 * The password does two independent jobs, and the copy says so: Supabase
 * checks it, and — separately, on this device, never transmitted — Argon2id
 * turns it into the key that decrypts the data. That is why a correct login
 * can still fail to unlock, and why there is no "forgot password" that
 * recovers data.
 */

import { Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Eyebrow, Field, Mono, Sans } from '@/components/base';
import { isSupabaseConfigured } from '@/lib/supabase';
import { WrongPasswordError, useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export default function Login() {
  const { c } = useTheme();
  const {
    status,
    email: sessionEmail,
    pendingRecoveryCode,
    acknowledgeRecoveryCode,
    signIn,
    signUp,
    unlock,
    setUpKeys,
    signOut,
  } = useAuth();

  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const needsKeySetup = status === 'no-keys';
  const isLocked = status === 'locked';
  const askForEmail = status === 'signed-out';

  const eye = (
    <Pressable onPress={() => setShow(s => !s)} hitSlop={10}>
      {show ? <EyeOff size={16} color={c.mutedForeground} /> : <Eye size={16} color={c.mutedForeground} />}
    </Pressable>
  );

  const submit = async () => {
    const next: Record<string, string> = {};
    if (askForEmail && !email.trim()) next.email = 'Required';
    if (!password) next.password = 'Required';
    // Argon2id output is only as strong as what goes in, and this password is
    // the sole thing standing between a database dump and the data in it.
    if ((mode === 'sign-up' || needsKeySetup) && password.length < 12) {
      next.password = 'Use at least 12 characters';
    }
    if ((mode === 'sign-up' || needsKeySetup) && password !== confirm) {
      next.confirm = 'Passwords do not match';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    setErrors({});
    try {
      if (needsKeySetup) {
        // The code it returns is also published on the auth store, which is
        // what keeps this screen mounted long enough to show it.
        await setUpKeys(password);
      } else if (isLocked) {
        await unlock(password);
      } else if (mode === 'sign-up') {
        const result = await signUp(email.trim(), password);
        if (!result) setErrors({ email: 'Check your inbox to confirm, then sign in.' });
      } else {
        await signIn(email.trim(), password);
      }
    } catch (e) {
      if (e instanceof WrongPasswordError) {
        setErrors({ password: e.message });
      } else {
        setErrors({ password: e instanceof Error ? e.message : 'Something went wrong' });
      }
    } finally {
      setBusy(false);
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
        <View style={{ flex: 1, padding: space.xl, justifyContent: 'center', gap: space.md }}>
          <Sans size={20} weight="semibold">Supabase is not configured</Sans>
          <Sans tone="muted">
            Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in the app&apos;s
            environment, then restart the bundler.
          </Sans>
        </View>
      </SafeAreaView>
    );
  }

  // Shown once, and only once — there is no second copy anywhere. The server
  // holds the DEK wrapped under this code and cannot open it either.
  if (pendingRecoveryCode) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
        <View style={{ flex: 1, padding: space.xl, justifyContent: 'center', gap: space.lg }}>
          <ShieldCheck size={32} color={c.primary} />
          <Sans size={24} weight="semibold">Write this down</Sans>
          <Sans tone="muted" style={{ lineHeight: 21 }}>
            This recovery code is the only way back into your data if you forget your
            password. It is shown once and is not stored anywhere you can read it again.
          </Sans>
          <Card style={{ padding: space.lg, alignItems: 'center' }}>
            <Mono size={16} numeric={false} style={{ letterSpacing: 1 }}>
              {pendingRecoveryCode}
            </Mono>
          </Card>
          <Sans tone="muted" size={12} style={{ lineHeight: 18 }}>
            Lose both the password and this code and the data cannot be recovered — not by
            you, and not by the server, which never has the key.
          </Sans>
          <Button title="I've written it down" onPress={acknowledgeRecoveryCode} />
        </View>
      </SafeAreaView>
    );
  }

  const title = needsKeySetup
    ? 'Secure your data'
    : isLocked
      ? 'Welcome back'
      : mode === 'sign-up'
        ? 'Create your account'
        : 'Sign in';

  const blurb = needsKeySetup
    ? 'Choose a password to encrypt your transactions. It never leaves this device — the server only ever sees the result, which it cannot open.'
    : isLocked
      ? `Signed in as ${sessionEmail ?? 'your account'}. Enter your password to decrypt your data on this device.`
      : mode === 'sign-up'
        ? 'Your password both signs you in and encrypts your transactions. The second half happens here on your phone.'
        : 'Your password signs you in and, separately on this device, unlocks your data.';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.xl, flexGrow: 1, justifyContent: 'center' }}>
          <View style={{ gap: space.sm }}>
            <Lock size={28} color={c.primary} />
            <Eyebrow>{needsKeySetup || isLocked ? 'Unlock' : 'Account'}</Eyebrow>
            <Sans size={24} weight="semibold">{title}</Sans>
            <Sans tone="muted" style={{ lineHeight: 21 }}>{blurb}</Sans>
          </View>

          <View style={{ gap: space.lg }}>
            {askForEmail && (
              <Field
                label="Email"
                required
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                error={errors.email}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
              />
            )}

            <Field
              label="Password"
              required
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••••••"
              secureTextEntry={!show}
              error={errors.password}
              autoCapitalize="none"
              autoCorrect={false}
              accessory={eye}
            />

            {(mode === 'sign-up' || needsKeySetup) && (
              <Field
                label="Confirm password"
                required
                value={confirm}
                onChangeText={setConfirm}
                placeholder="••••••••••••"
                secureTextEntry={!show}
                error={errors.confirm}
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}

            <Button
              title={
                busy
                  ? 'Deriving key…'
                  : needsKeySetup
                    ? 'Encrypt my data'
                    : isLocked
                      ? 'Unlock'
                      : mode === 'sign-up'
                        ? 'Create account'
                        : 'Sign in'
              }
              loading={busy}
              onPress={submit}
            />

            {busy && (
              <Sans tone="muted" size={12} style={{ textAlign: 'center' }}>
                Argon2id takes a moment on purpose — it is what makes the password
                expensive to guess.
              </Sans>
            )}

            {askForEmail && (
              <Pressable onPress={() => { setMode(m => (m === 'sign-in' ? 'sign-up' : 'sign-in')); setErrors({}); }}>
                <Sans tone="muted" size={13} style={{ textAlign: 'center' }}>
                  {mode === 'sign-in' ? 'No account yet? Create one' : 'Already have an account? Sign in'}
                </Sans>
              </Pressable>
            )}

            {(isLocked || needsKeySetup) && (
              <Pressable onPress={signOut}>
                <Sans tone="muted" size={13} style={{ textAlign: 'center' }}>
                  Sign out and use a different account
                </Sans>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
