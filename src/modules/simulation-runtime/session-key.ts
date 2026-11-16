/**
 * Session_Key generation and format checks (Req 18.2).
 *
 * Runtime-neutral: uses only the global Web Crypto API (`crypto`), which is
 * available in Node.js and Cloudflare Workers. No `node:*` imports.
 */

/** Number of random bytes in a Session_Key (256 bits). */
export const SESSION_KEY_BYTES = 32;

/** 43 base64url characters, no padding. */
export const SESSION_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** 32 bytes from the platform CSPRNG, base64url without padding (43 chars, 256 bits). */
export function generateSessionKey(): string {
  const bytes = new Uint8Array(SESSION_KEY_BYTES);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/**
 * Format check only; never touches storage. A key is well formed when it
 * matches the pattern and is the canonical encoding of exactly 32 bytes
 * (the unused low bits of the final character are zero).
 */
export function isWellFormedSessionKey(value: string): boolean {
  if (!SESSION_KEY_PATTERN.test(value)) return false;
  const decoded = base64UrlDecode(value);
  return decoded !== null && decoded.length === SESSION_KEY_BYTES;
}

/** First 8 hex chars of SHA-256(key), for logs only. */
export async function sessionKeyFingerprint(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(digest)]
    .slice(0, 4)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Encodes bytes as unpadded base64url. */
export function base64UrlEncode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;
    const remaining = bytes.length - i;
    out += ALPHABET[(triple >> 18) & 63];
    out += ALPHABET[(triple >> 12) & 63];
    if (remaining > 1) out += ALPHABET[(triple >> 6) & 63];
    if (remaining > 2) out += ALPHABET[triple & 63];
  }
  return out;
}

/**
 * Decodes unpadded base64url. Returns null for characters outside the
 * alphabet, an impossible length, or non-zero trailing bits (non-canonical).
 */
export function base64UrlDecode(value: string): Uint8Array | null {
  if (value.length % 4 === 1) return null;
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of value) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) return null;
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
    buffer &= (1 << bits) - 1;
  }
  if (buffer !== 0) return null;
  return Uint8Array.from(out);
}
