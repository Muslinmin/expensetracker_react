/**
 * Client-side key handling. The mirror of `app/crypto/kdf.py` on the backend —
 * the two must agree byte for byte, and there is a cross-language test vector
 * at the bottom of this file to prove they do.
 *
 *   password ──Argon2id(salt)──> KEK ──unwraps──> DEK ──> X-Data-Key header
 *
 * The password never leaves the device in any form the server could use. What
 * the server stores is `wrapped_dek`: the data key sealed under a key derived
 * from the password, which it has no way to derive. It hands the sealed blob
 * back on request and cannot tell whether the password used to open it was
 * right.
 *
 * Argon2id here is pure JavaScript (`@noble/hashes`). Expo Go has no native
 * Argon2 and Hermes has no WASM, so this is the only option that keeps the app
 * runnable without a custom dev build. It is why the cost parameters are
 * OWASP's mobile-friendly configuration rather than something heavier — see
 * KDF_PARAMS below.
 */

import { gcm } from '@noble/ciphers/aes.js';
import { argon2id } from '@noble/hashes/argon2.js';
import * as Crypto from 'expo-crypto';

/** OWASP-recommended Argon2id configuration (m=19 MiB, t=2, p=1). */
export const ARGON2_TIME_COST = 2;
export const ARGON2_MEMORY_COST_KIB = 19456;
export const ARGON2_PARALLELISM = 1;
export const ARGON2_HASH_LEN = 32;
export const SALT_BYTES = 16;
export const DEK_BYTES = 32;
const NONCE_BYTES = 12;
const FORMAT_V1 = 1;

/**
 * Recorded on the server alongside each user's wrapped key. Stored rather than
 * assumed so that raising the cost later re-wraps at next login instead of
 * locking anyone out.
 */
export const KDF_PARAMS = `argon2id$v=19$m=${ARGON2_MEMORY_COST_KIB},t=${ARGON2_TIME_COST},p=${ARGON2_PARALLELISM}`;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Hermes' global atob/btoa coverage is inconsistent across RN versions. */
export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? '=' : B64[c & 63];
  }
  return out;
}

export function fromBase64(value: string): Uint8Array {
  const clean = value.replace(/=+$/, '');
  const out = new Uint8Array((clean.length * 3) >> 2);
  let bits = 0;
  let acc = 0;
  let n = 0;
  for (const ch of clean) {
    const idx = B64.indexOf(ch);
    if (idx < 0) throw new Error('invalid base64');
    acc = (acc << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[n++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, n);
}

export function randomBytes(length: number): Uint8Array {
  // expo-crypto, not Math.random and not @noble's own source: this needs the
  // platform CSPRNG, and noble looks for a WebCrypto that Hermes lacks.
  return Crypto.getRandomBytes(length);
}

/** Argon2id the password into a key-encryption key. Takes ~1s on a phone. */
export function deriveKek(password: string, salt: Uint8Array): Uint8Array {
  return argon2id(new TextEncoder().encode(password), salt, {
    t: ARGON2_TIME_COST,
    m: ARGON2_MEMORY_COST_KIB,
    p: ARGON2_PARALLELISM,
    dkLen: ARGON2_HASH_LEN,
  });
}

/**
 * Wrapped-key layout, identical to the column ciphertext framing the backend
 * uses so there is only one format to implement:
 *
 *     byte 0        format version (1)
 *     bytes 1..12   AES-GCM nonce
 *     bytes 13..    ciphertext ‖ 16-byte tag
 */
export function wrapKey(kek: Uint8Array, dek: Uint8Array): Uint8Array {
  const nonce = randomBytes(NONCE_BYTES);
  const sealed = gcm(kek, nonce).encrypt(dek);
  const out = new Uint8Array(1 + NONCE_BYTES + sealed.length);
  out[0] = FORMAT_V1;
  out.set(nonce, 1);
  out.set(sealed, 1 + NONCE_BYTES);
  return out;
}

/**
 * Recover the data key. Throws if the password was wrong.
 *
 * GCM authenticates as well as encrypts, so a wrong password fails here rather
 * than yielding a plausible-looking key that would silently decrypt every
 * transaction into garbage.
 */
export function unwrapKey(kek: Uint8Array, wrapped: Uint8Array): Uint8Array {
  if (wrapped.length < 1 + NONCE_BYTES || wrapped[0] !== FORMAT_V1) {
    throw new Error('Unrecognised wrapped-key format');
  }
  return gcm(kek, wrapped.subarray(1, 1 + NONCE_BYTES)).decrypt(
    wrapped.subarray(1 + NONCE_BYTES),
  );
}

export function newDataKey(): Uint8Array {
  return randomBytes(DEK_BYTES);
}

export function newSalt(): Uint8Array {
  return randomBytes(SALT_BYTES);
}

/**
 * A recovery code, in the same format the migration script prints.
 *
 * Wrapping the DEK a second time under this is what makes a forgotten password
 * survivable. There is no server-side reset: nothing on the server can open
 * the key, so nothing on the server can help.
 */
export function newRecoveryCode(): string {
  const bytes = randomBytes(12);
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0').toUpperCase());
  return Array.from({ length: 6 }, (_, i) => hex[i * 2] + hex[i * 2 + 1]).join('-');
}

/**
 * Cross-language test vector. `deriveKek('a-very-long-test-password', 0..15)`
 * must equal this, which is what `app/crypto/kdf.py` produces for the same
 * input. If a parameter here ever drifts from the backend's, every existing
 * user's key stops unwrapping — so it is worth being able to check cheaply.
 */
export const TEST_VECTOR = {
  password: 'a-very-long-test-password',
  salt: Uint8Array.from({ length: 16 }, (_, i) => i),
  expectedKekHex: '7e594653a7a13be70954c3441885fbe54c9ab98d8322c5cbef6ba235fa65721f',
};

export function selfTest(): boolean {
  const kek = deriveKek(TEST_VECTOR.password, TEST_VECTOR.salt);
  const hex = Array.from(kek, b => b.toString(16).padStart(2, '0')).join('');
  return hex === TEST_VECTOR.expectedKekHex;
}
