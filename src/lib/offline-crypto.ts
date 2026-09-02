// PBKDF2 + AES-256-GCM helpers backing offline PIN login (see
// src/lib/offline-auth.ts and the "Offline PIN Login" plan). Parameterized on
// a `Crypto` instance (browser `window.crypto`, or Node's `webcrypto` from
// `node:crypto`) so the exact same derivation runs server-side, at the three
// places a raw PIN is ever seen (src/server/staff-admin.ts), and client-side,
// when a till decrypts its cached copy with no network at all. Pure aside
// from that injected instance -- safe to import from client code, server
// code, and Admin-SDK scripts alike, same rule as src/lib/staff-auth.ts.
//
// AES-GCM's authentication tag is what makes a wrong passphrase fail loudly
// (decrypt() throws) instead of silently returning garbage -- that failure IS
// the "wrong PIN" signal callers rely on, not a side channel to add later.

export const OFFLINE_PBKDF2_ITERATIONS = 300_000;

export interface OfflineBlob {
  salt: string; // base64
  iterations: number;
  iv: string; // base64
  ciphertext: string; // base64
}

const te = new TextEncoder();
const td = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function deriveKey(
  subtle: SubtleCrypto,
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const keyMaterial = await subtle.importKey("raw", te.encode(passphrase), "PBKDF2", false, [
    "deriveKey",
  ]);
  return subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypts `payload` under a key derived from `passphrase` (a PIN, server-side,
 *  or a device secret, client-side -- this function doesn't care which). */
export async function encryptOfflinePayload(
  cryptoImpl: Crypto,
  passphrase: string,
  payload: unknown,
  iterations = OFFLINE_PBKDF2_ITERATIONS,
): Promise<OfflineBlob> {
  const salt = cryptoImpl.getRandomValues(new Uint8Array(16));
  const iv = cryptoImpl.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(cryptoImpl.subtle, passphrase, salt, iterations);
  const ciphertext = await cryptoImpl.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    te.encode(JSON.stringify(payload)),
  );
  return {
    salt: toBase64(salt),
    iterations,
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

/** Returns `null` on a wrong passphrase or a corrupt blob (AES-GCM auth-tag
 *  failure) -- never throws, so callers can treat both the same way. */
export async function decryptOfflinePayload<T = unknown>(
  cryptoImpl: Crypto,
  passphrase: string,
  blob: OfflineBlob,
): Promise<T | null> {
  try {
    const salt = fromBase64(blob.salt);
    const iv = fromBase64(blob.iv);
    const key = await deriveKey(cryptoImpl.subtle, passphrase, salt, blob.iterations);
    const plaintext = await cryptoImpl.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      fromBase64(blob.ciphertext) as BufferSource,
    );
    return JSON.parse(td.decode(plaintext)) as T;
  } catch {
    return null;
  }
}
