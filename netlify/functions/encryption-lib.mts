import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const AAD_PREFIX = "hercules-hub|participant-data|";

function env(name: string): string {
  if (typeof Netlify !== "undefined" && Netlify?.env?.get) return String(Netlify.env.get(name) || "").trim();
  return String(process.env[name] || "").trim();
}

function currentKeyVersion(): number {
  const raw = env("HERCULES_DATA_ENCRYPTION_CURRENT_VERSION") || "1";
  const version = Number(raw);
  if (!Number.isSafeInteger(version) || version < 1 || version > 32767) throw new Error("data_encryption_version_invalid");
  return version;
}

function keyForVersion(version: number): Buffer {
  const raw = env(`HERCULES_DATA_ENCRYPTION_KEY_V${version}`);
  if (!raw) throw new Error("data_encryption_key_unavailable");
  const key = Buffer.from(raw, "base64url");
  if (key.length !== 32) throw new Error("data_encryption_key_invalid");
  return key;
}

export function dataEncryptionConfigured(): boolean {
  try { keyForVersion(currentKeyVersion()); return true; } catch { return false; }
}

export function encryptParticipantData(value: unknown, context: { purpose: string; profileId: string }): { ciphertext: Buffer; keyVersion: number } {
  const purpose = String(context?.purpose || "");
  const profileId = String(context?.profileId || "");
  if (!/^[a-z][a-z0-9_-]{1,40}$/i.test(purpose) || !/^[0-9a-f-]{36}$/i.test(profileId)) throw new Error("data_encryption_context_invalid");
  const keyVersion = currentKeyVersion();
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyForVersion(keyVersion), nonce);
  cipher.setAAD(Buffer.from(`${AAD_PREFIX}${keyVersion}|${purpose}|${profileId}`));
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext: Buffer.concat([nonce, cipher.getAuthTag(), encrypted]), keyVersion };
}

export function decryptParticipantData(ciphertext: Uint8Array, keyVersion: number, context: { purpose: string; profileId: string }): unknown {
  const bytes = Buffer.from(ciphertext);
  if (bytes.length < 29 || !Number.isSafeInteger(keyVersion) || keyVersion < 1) throw new Error("data_ciphertext_invalid");
  const purpose = String(context?.purpose || "");
  const profileId = String(context?.profileId || "");
  if (!/^[a-z][a-z0-9_-]{1,40}$/i.test(purpose) || !/^[0-9a-f-]{36}$/i.test(profileId)) throw new Error("data_encryption_context_invalid");
  const decipher = createDecipheriv("aes-256-gcm", keyForVersion(keyVersion), bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(`${AAD_PREFIX}${keyVersion}|${purpose}|${profileId}`));
  decipher.setAuthTag(bytes.subarray(12, 28));
  const plaintext = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
  try { return JSON.parse(plaintext.toString("utf8")); } catch { throw new Error("data_payload_invalid"); }
}
