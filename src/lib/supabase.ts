/**
 * The Supabase client, and the storage the session lives in.
 *
 * Configuration comes from EXPO_PUBLIC_* variables, which Expo inlines at
 * build time. The anon key is meant to be public — it identifies the project
 * and nothing more; every row it can reach is still gated by the backend's
 * token verification and by row level security.
 */

import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * SecureStore rejects values over 2048 bytes on Android, and a Supabase
 * session — access token, refresh token, user object — routinely exceeds that.
 * Splitting across numbered keys keeps the session in the hardware-backed
 * keystore instead of falling back to AsyncStorage, which is plain unencrypted
 * files any other process with device access can read.
 */
const CHUNK_SIZE = 1800;

const chunkedSecureStore = {
  async getItem(key: string): Promise<string | null> {
    const count = await SecureStore.getItemAsync(`${key}__n`);
    if (count === null) return SecureStore.getItemAsync(key);

    const parts: string[] = [];
    for (let i = 0; i < Number(count); i++) {
      const part = await SecureStore.getItemAsync(`${key}__${i}`);
      if (part === null) return null; // torn write — treat as absent
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    await this.removeItem(key);
    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(`${key}__${i}`, chunks[i]);
    }
    // Written last: the count is what makes the chunks readable, so a crash
    // partway through leaves them orphaned rather than half-readable.
    await SecureStore.setItemAsync(`${key}__n`, String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    const count = await SecureStore.getItemAsync(`${key}__n`);
    if (count !== null) {
      for (let i = 0; i < Number(count); i++) {
        await SecureStore.deleteItemAsync(`${key}__${i}`).catch(() => {});
      }
      await SecureStore.deleteItemAsync(`${key}__n`).catch(() => {});
    }
    await SecureStore.deleteItemAsync(key).catch(() => {});
  },
};

// createClient throws "supabaseUrl is required" on an empty string, and it
// does it at module scope — before any component mounts. That made the
// `isSupabaseConfigured` check in the login screen unreachable: the app died
// on import with a red box instead of rendering the screen that explains what
// to configure. The placeholders keep it constructible; nothing ever calls it
// while `isSupabaseConfigured` is false, and `.invalid` is reserved by RFC 2606
// precisely so it cannot resolve if something ever did.
const PLACEHOLDER_URL = 'http://supabase-not-configured.invalid';
const PLACEHOLDER_KEY = 'not-configured';

export const supabase = createClient(
  SUPABASE_URL || PLACEHOLDER_URL,
  SUPABASE_ANON_KEY || PLACEHOLDER_KEY,
  {
  auth: {
    storage: chunkedSecureStore,
    autoRefreshToken: true,
    persistSession: true,
    // There is no deep-link OAuth flow here — email and password only — and
    // leaving this on makes the client try to parse every URL the app opens.
    detectSessionInUrl: false,
    },
  },
);
