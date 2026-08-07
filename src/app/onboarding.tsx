import { CheckCircle2, Eye, EyeOff, Moon, Sun, TrendingDown } from 'lucide-react-native';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Eyebrow, Field, Mono, Sans } from '@/components/base';
import { ApiAuthError, ApiNetworkError, createApi } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import { DEFAULT_PREFS, useSettings } from '@/store/settings';
import { useTheme } from '@/theme/ThemeProvider';
import { type ThemeName, font, space } from '@/theme/tokens';

type Step = 'welcome' | 'connection';

const FEATURES = [
  { title: 'Auto-categorized transactions', sub: 'LLM-powered, learns your habits' },
  { title: 'Monthly budget buckets', sub: 'Set limits per spending category' },
  { title: 'Visual spending trends', sub: 'Charts that show the real picture' },
];

export default function Onboarding() {
  const { c } = useTheme();
  const { prefs, setPrefs, setServerKey } = useSettings();
  const [step, setStep] = useState<Step>('welcome');

  const [name, setName] = useState(prefs.name);
  const [baseUrl, setBaseUrl] = useState(prefs.apiBaseUrl || DEFAULT_PREFS.apiBaseUrl);
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState(false);

  const setTheme = (t: ThemeName) => setPrefs({ theme: t });

  /**
   * The scaffold accepted any non-empty string as a key, so a typo produced an
   * app where every screen failed at once. We spend one round-trip proving the
   * credentials work before letting the user through.
   */
  const finish = async () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Required';
    if (!baseUrl.trim()) next.baseUrl = 'Required';
    if (!key.trim()) next.key = 'Required';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setChecking(true);
    try {
      await endpoints.categories(createApi(baseUrl.trim(), key.trim()));
      await setServerKey(key.trim());
      await setPrefs({ name: name.trim(), apiBaseUrl: baseUrl.trim(), onboarded: true });
    } catch (e) {
      if (e instanceof ApiAuthError) {
        setErrors({ key: 'Server rejected this key' });
      } else if (e instanceof ApiNetworkError) {
        setErrors({
          baseUrl: 'Could not reach this address. On an emulator use 10.0.2.2, not localhost.',
        });
      } else {
        setErrors({ baseUrl: e instanceof Error ? e.message : 'Connection failed' });
      }
    } finally {
      setChecking(false);
    }
  };

  if (step === 'welcome') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
        <View style={{ flex: 1, padding: space.xl, justifyContent: 'center' }}>
          <View style={{ alignItems: 'center', gap: space.md, marginBottom: space.xxl }}>
            <View
              style={{
                width: 64,
                height: 64,
                backgroundColor: c.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <TrendingDown size={32} color={c.primaryForeground} strokeWidth={2} />
            </View>
            <View style={{ alignItems: 'center' }}>
              <Sans size={36} weight="bold" style={{ letterSpacing: -1.5 }}>
                XPNS
              </Sans>
              <Mono size={10} tone="muted" numeric={false} style={{ letterSpacing: 3 }}>
                EXPENSE TRACKER
              </Mono>
            </View>
          </View>

          <View style={{ alignItems: 'center', marginBottom: space.xxl, gap: space.sm }}>
            <Sans size={20} weight="semibold" style={{ textAlign: 'center' }}>
              Know where every dollar goes.
            </Sans>
            <Sans tone="muted" style={{ textAlign: 'center', lineHeight: 21 }}>
              XPNS reads your bank statements, categorizes spending automatically, and keeps
              you inside your budget — every month.
            </Sans>
          </View>

          <View style={{ gap: space.lg, marginBottom: space.xxl }}>
            {FEATURES.map(f => (
              <View key={f.title} style={{ flexDirection: 'row', gap: space.md }}>
                <View
                  style={{ width: 6, height: 6, backgroundColor: c.primary, marginTop: 6 }}
                />
                <View style={{ flex: 1 }}>
                  <Sans weight="medium">{f.title}</Sans>
                  <Sans size={12} tone="muted">
                    {f.sub}
                  </Sans>
                </View>
              </View>
            ))}
          </View>

          <Button title="Get Started  →" onPress={() => setStep('connection')} />
          <Mono size={10} tone="muted" numeric={false} style={{ textAlign: 'center', marginTop: space.md }}>
            Takes about a minute
          </Mono>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: space.xl, paddingTop: space.xl }}>
          <View style={{ flex: 1, height: 2, backgroundColor: c.primary }} />
          <View style={{ flex: 1, height: 2, backgroundColor: c.primary }} />
        </View>

        <ScrollView
          contentContainerStyle={{ padding: space.xl, gap: space.xl }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={{ gap: space.xs }}>
            <Eyebrow>Connect</Eyebrow>
            <Sans size={24} weight="semibold">
              Your server
            </Sans>
            <Sans tone="muted">
              XPNS talks to your own backend. Point it at the address and paste the API key
              from the server's environment.
            </Sans>
          </View>

          <View style={{ gap: space.lg }}>
            <Field
              label="Your Name"
              required
              value={name}
              onChangeText={setName}
              placeholder="Jordan Kim"
              error={errors.name}
              autoCapitalize="words"
              style={{ fontFamily: font.sans, fontSize: 14 }}
            />

            <Field
              label="Server Address"
              required
              value={baseUrl}
              onChangeText={setBaseUrl}
              placeholder="http://10.0.2.2:8000"
              error={errors.baseUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />

            <Field
              label="Server API Key"
              required
              value={key}
              onChangeText={setKey}
              placeholder="paste FAST_API_KEY"
              secureTextEntry={!showKey}
              error={errors.key}
              autoCapitalize="none"
              autoCorrect={false}
              accessory={
                <Pressable onPress={() => setShowKey(s => !s)} hitSlop={10}>
                  {showKey ? (
                    <EyeOff size={16} color={c.mutedForeground} />
                  ) : (
                    <Eye size={16} color={c.mutedForeground} />
                  )}
                </Pressable>
              }
            />

            <View style={{ gap: space.sm }}>
              <Eyebrow>Appearance</Eyebrow>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                {(['light', 'dark'] as ThemeName[]).map(t => {
                  const active = prefs.theme === t;
                  const Icon = t === 'light' ? Sun : Moon;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => setTheme(t)}
                      style={({ pressed }) => ({
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: space.sm,
                        paddingVertical: 12,
                        backgroundColor: active ? c.primary : c.inputBackground,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: active ? c.primary : 'transparent',
                        opacity: pressed ? 0.75 : 1,
                      })}>
                      <Icon size={16} color={active ? c.primaryForeground : c.mutedForeground} />
                      <Sans
                        weight="medium"
                        style={{ color: active ? c.primaryForeground : c.mutedForeground }}>
                        {t === 'light' ? 'Light' : 'Dark'}
                      </Sans>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </ScrollView>

        <View
          style={{
            padding: space.xl,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: c.border,
            flexDirection: 'row',
            gap: space.md,
          }}>
          <Button title="Back" variant="outline" onPress={() => setStep('welcome')} />
          <Button
            title={checking ? 'Checking…' : 'Connect'}
            loading={checking}
            onPress={finish}
            style={{ flex: 1 }}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
