/**
 * Encryption utilities for secure credential storage.
 * Uses Web Crypto API — available in extension service workers.
 */

const ALGO = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const ITERATIONS = 100_000;

/**
 * Derive an AES-256-GCM key from a password using PBKDF2.
 */
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: ALGO, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt plaintext with a password.
 * Returns base64 string: salt(16) + iv(12) + ciphertext
 */
export async function encrypt(plaintext, password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);
  const ct = await crypto.subtle.encrypt(
    { name: ALGO, iv },
    key,
    enc.encode(plaintext)
  );
  const combined = new Uint8Array(salt.length + iv.length + ct.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ct), salt.length + iv.length);
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a base64 encrypted string with a password.
 */
export async function decrypt(cipherB64, password) {
  const dec = new TextDecoder();
  const raw = Uint8Array.from(atob(cipherB64), c => c.charCodeAt(0));
  const salt = raw.slice(0, SALT_LENGTH);
  const iv = raw.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const ct = raw.slice(SALT_LENGTH + IV_LENGTH);
  const key = await deriveKey(password, salt);
  const pt = await crypto.subtle.decrypt({ name: ALGO, iv }, key, ct);
  return dec.decode(pt);
}
