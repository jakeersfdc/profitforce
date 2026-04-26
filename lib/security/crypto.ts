/**
 * AES-256-GCM token vault.
 *
 * Master key:
 *   ENCRYPTION_KEY = base64-encoded 32 random bytes
 *   Generate locally:
 *     openssl rand -base64 32
 *
 * Format on disk (base64): iv(12) | tag(16) | ciphertext(N)
 *
 * Never log payloads. Never expose decrypted tokens to the client.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY not configured");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be base64-encoded 32 bytes");
  }
  return buf;
}

export function encryptJson(value: unknown): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plain = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptJson<T = unknown>(payload: string): T {
  const key = getKey();
  const buf = Buffer.from(payload, "base64");
  if (buf.length < 12 + 16 + 1) throw new Error("ciphertext too short");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plain.toString("utf8")) as T;
}

/** True iff ENCRYPTION_KEY is correctly configured. Never throws. */
export function vaultReady(): boolean {
  try { getKey(); return true; } catch { return false; }
}
