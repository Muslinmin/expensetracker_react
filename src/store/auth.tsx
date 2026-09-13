/**
 * Session and data key.
 *
 * Two separate things have to be true before the app can show a transaction:
 * the user is signed in (Supabase issues a JWT, which authorises the request)
 * and the app holds the data key (which decrypts what comes back). They are
 * deliberately independent — a valid session with no key is a real state, and
 * it means "signed in, locked", not "broken".
 *
 *   status = 'signed-out'  no session
 *   status = 'locked'      session, but no data key — ask for the password
 *   status = 'no-keys'     session, but this account has never set a password
 *                          for its data; first-run setup
 *   status = 'ready'       both
 *
 * The password is used for two unrelated things at once, which is worth being
 * clear about: Supabase authenticates against it, and — separately, locally,
 * never transmitted — Argon2id turns it into the key that unwraps the DEK. The
 * server sees one of those and not the other.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

import {
  KDF_PARAMS,
  deriveKek,
  fromBase64,
  newDataKey,
  newRecoveryCode,
  newSalt,
  toBase64,
  unwrapKey,
  wrapKey,
} from '@/lib/crypto/keys';
import { supabase } from '@/lib/supabase';
import { useSettings } from '@/store/settings';

const DEK_STORE_KEY = 'xpns_data_key';

export type AuthStatus = 'loading' | 'signed-out' | 'locked' | 'no-keys' | 'ready';

interface KeyMaterial {
  kdf_salt: string;
  kdf_params: string;
  wrapped_dek: string;
  recovery_wrapped_dek: string | null;
}

interface AuthValue {
  status: AuthStatus;
  /**
   * Set once, immediately after key material is created, and cleared only when
   * the user acknowledges having written it down.
   *
   * It lives here rather than in the login screen's own state because the
   * route guard has to see it. Unwrapping the key flips `status` to 'ready',
   * and the guard reacts by navigating to the dashboard — which unmounted the
   * screen showing the code before it could be read. The code is the only way
   * back into the data after a forgotten password, and it is shown exactly
   * once, so losing it to a redirect is unrecoverable.
   */
  pendingRecoveryCode: string | null;
  acknowledgeRecoveryCode: () => void;
  session: Session | null;
  email: string | null;
  /** Base64 of the 32-byte data key, for the X-Data-Key header. */
  dataKey: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ recoveryCode: string } | null>;
  /** Unlock an existing session whose key was cleared. */
  unlock: (password: string) => Promise<void>;
  /** First-time key setup for an account that has none. */
  setUpKeys: (password: string) => Promise<{ recoveryCode: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export class WrongPasswordError extends Error {
  constructor() {
    super('That password does not unlock your data');
    this.name = 'WrongPasswordError';
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { prefs } = useSettings();
  const [session, setSession] = useState<Session | null>(null);
  const [dataKey, setDataKey] = useState<string | null>(null);
  const [hasKeyMaterial, setHasKeyMaterial] = useState<boolean | null>(null);
  const [pendingRecoveryCode, setPendingRecoveryCode] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const baseUrl = prefs.apiBaseUrl.replace(/\/+$/, '');

  /** GET/POST /keys with the session token. Kept here rather than in the API
   *  client because it runs before the API client has a key to give it. */
  const keysRequest = useCallback(
    async (token: string, init?: RequestInit): Promise<Response> =>
      fetch(`${baseUrl}/keys`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init?.headers ?? {}),
        },
      }),
    [baseUrl],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data }, storedKey] = await Promise.all([
        supabase.auth.getSession(),
        SecureStore.getItemAsync(DEK_STORE_KEY).catch(() => null),
      ]);
      if (cancelled) return;
      setSession(data.session);
      setDataKey(storedKey);
      setHydrated(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setDataKey(null);
        setHasKeyMaterial(null);
        SecureStore.deleteItemAsync(DEK_STORE_KEY).catch(() => {});
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Whether this account has key material at all decides between "ask for the
  // password" and "set one up", so it has to be known before either screen.
  useEffect(() => {
    if (!session || dataKey || hasKeyMaterial !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await keysRequest(session.access_token);
        if (!cancelled) setHasKeyMaterial(res.status !== 404);
      } catch {
        // Unreachable backend is not the same as "no keys". Leaving this null
        // keeps the app on the loading state rather than offering to set up a
        // second key that would orphan the first.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, dataKey, hasKeyMaterial, keysRequest]);

  const rememberKey = useCallback(async (dek: Uint8Array) => {
    const encoded = toBase64(dek);
    setDataKey(encoded);
    // Persisted in the hardware-backed keystore rather than held in memory
    // only. Memory-only would mean re-deriving Argon2id on every cold start,
    // and an expense tracker that demands a password each time it is opened is
    // one nobody opens. The keystore is protected by the device lock.
    await SecureStore.setItemAsync(DEK_STORE_KEY, encoded).catch(() => {});
  }, []);

  const fetchAndUnwrap = useCallback(
    async (token: string, password: string) => {
      const res = await keysRequest(token);
      if (res.status === 404) {
        setHasKeyMaterial(false);
        return;
      }
      if (!res.ok) throw new Error(`Could not fetch key material (${res.status})`);

      const material: KeyMaterial = await res.json();
      const kek = deriveKek(password, fromBase64(material.kdf_salt));
      let dek: Uint8Array;
      try {
        dek = unwrapKey(kek, fromBase64(material.wrapped_dek));
      } catch {
        throw new WrongPasswordError();
      }
      setHasKeyMaterial(true);
      await rememberKey(dek);
    },
    [keysRequest, rememberKey],
  );

  const createKeyMaterial = useCallback(
    async (token: string, password: string) => {
      const dek = newDataKey();
      const salt = newSalt();
      const recoveryCode = newRecoveryCode();
      const recoverySalt = newSalt();

      const kek = deriveKek(password, salt);
      const recoveryKek = deriveKek(recoveryCode, recoverySalt);

      const res = await keysRequest(token, {
        method: 'POST',
        body: JSON.stringify({
          kdf_salt: toBase64(salt),
          // The recovery salt rides along in the params string, the same shape
          // scripts/migrate_sqlcipher_to_postgres.py writes.
          kdf_params: `${KDF_PARAMS}|recovery_salt=${toBase64(recoverySalt)}`,
          wrapped_dek: toBase64(wrapKey(kek, dek)),
          recovery_wrapped_dek: toBase64(wrapKey(recoveryKek, dek)),
        }),
      });
      if (res.status === 409) {
        throw new Error('This account already has key material — sign in instead.');
      }
      if (!res.ok) throw new Error(`Could not save key material (${res.status})`);

      setHasKeyMaterial(true);
      setPendingRecoveryCode(recoveryCode);
      // Set before the key: rememberKey is what flips status to 'ready', and
      // the guard navigates on that. The code has to already be pending when
      // it does, or the screen is gone before it renders.
      await rememberKey(dek);
      return { recoveryCode };
    },
    [keysRequest, rememberKey],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data.session) await fetchAndUnwrap(data.session.access_token, password);
    },
    [fetchAndUnwrap],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      // No session means the project requires email confirmation; key setup
      // has to wait until they come back and sign in.
      if (!data.session) return null;
      return createKeyMaterial(data.session.access_token, password);
    },
    [createKeyMaterial],
  );

  const unlock = useCallback(
    async (password: string) => {
      if (!session) throw new Error('Not signed in');
      await fetchAndUnwrap(session.access_token, password);
    },
    [session, fetchAndUnwrap],
  );

  const setUpKeys = useCallback(
    async (password: string) => {
      if (!session) throw new Error('Not signed in');
      return createKeyMaterial(session.access_token, password);
    },
    [session, createKeyMaterial],
  );

  const acknowledgeRecoveryCode = useCallback(() => setPendingRecoveryCode(null), []);

  const signOut = useCallback(async () => {
    await SecureStore.deleteItemAsync(DEK_STORE_KEY).catch(() => {});
    setDataKey(null);
    setHasKeyMaterial(null);
    setPendingRecoveryCode(null);
    await supabase.auth.signOut();
  }, []);

  const status: AuthStatus = !hydrated
    ? 'loading'
    : !session
      ? 'signed-out'
      : dataKey
        ? 'ready'
        : hasKeyMaterial === false
          ? 'no-keys'
          : hasKeyMaterial === true
            ? 'locked'
            : 'loading';

  const value = useMemo<AuthValue>(
    () => ({
      status,
      pendingRecoveryCode,
      acknowledgeRecoveryCode,
      session,
      email: session?.user?.email ?? null,
      dataKey,
      signIn,
      signUp,
      unlock,
      setUpKeys,
      signOut,
    }),
    [status, pendingRecoveryCode, acknowledgeRecoveryCode, session, dataKey,
     signIn, signUp, unlock, setUpKeys, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
