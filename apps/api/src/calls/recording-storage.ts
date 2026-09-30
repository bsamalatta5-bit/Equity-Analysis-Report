import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * A10.2. `storageDir` is a local-disk stand-in for the object store
 * (S3/Blob/GCS) this would use in a real deployment — no vendor SDK is
 * pinned in Section 3, the same reason `docker-compose.yml` and
 * `.env.example`'s `RECORDING_BUCKET` were always placeholders (see
 * docs/adr/version-substitutions.md). Everything else here — AES-256-GCM
 * encryption at rest and HMAC-signed, time-limited access tokens — is real
 * security engineering with no vendor dependency, not a fixture: it would
 * carry over unchanged to a real object-store backend, which would only
 * replace the file read/write calls below.
 */
export interface RecordingStorageConfig {
  readonly storageDir: string;
  readonly encryptionKey: Buffer;
  readonly signingSecret: string;
}

export function loadRecordingStorageConfig(env: NodeJS.ProcessEnv = process.env): RecordingStorageConfig {
  const encryptionKeyBase64 = env["RECORDING_ENCRYPTION_KEY"];
  const signingSecret = env["RECORDING_SIGNING_SECRET"];
  if (!encryptionKeyBase64) {
    throw new Error("RECORDING_ENCRYPTION_KEY is not set.");
  }
  if (!signingSecret) {
    throw new Error("RECORDING_SIGNING_SECRET is not set.");
  }
  const encryptionKey = Buffer.from(encryptionKeyBase64, "base64");
  if (encryptionKey.length !== 32) {
    throw new Error("RECORDING_ENCRYPTION_KEY must base64-decode to exactly 32 bytes (AES-256).");
  }
  return { storageDir: env["RECORDING_STORAGE_DIR"] ?? "./var/recordings", encryptionKey, signingSecret };
}

function assertSafeObjectKey(objectKey: string): void {
  if (objectKey.length === 0 || objectKey.startsWith("/") || objectKey.includes("..")) {
    throw new Error(`Invalid recording object key: ${JSON.stringify(objectKey)}`);
  }
}

function objectPath(config: RecordingStorageConfig, objectKey: string): string {
  assertSafeObjectKey(objectKey);
  return join(config.storageDir, `${objectKey}.enc`);
}

/** Encrypts with AES-256-GCM before the bytes ever touch disk — "encrypted at rest" per A10.2. */
export async function encryptAndStoreRecording(
  config: RecordingStorageConfig,
  objectKey: string,
  plaintext: Buffer,
): Promise<void> {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, config.encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const path = objectPath(config, objectKey);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.concat([iv, authTag, ciphertext]));
}

export async function retrieveAndDecryptRecording(
  config: RecordingStorageConfig,
  objectKey: string,
): Promise<Buffer> {
  const path = objectPath(config, objectKey);
  const raw = await readFile(path);
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, config.encryptionKey, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export async function deleteRecording(config: RecordingStorageConfig, objectKey: string): Promise<void> {
  await rm(objectPath(config, objectKey), { force: true });
}

// ---------------------------------------------------------------------------
// Signed, time-limited access tokens (A10.2)
// ---------------------------------------------------------------------------

export interface SignedRecordingToken {
  readonly objectKey: string;
  readonly expiresAtEpochSeconds: number;
}

function sign(config: RecordingStorageConfig, payload: string): string {
  return createHmac("sha256", config.signingSecret).update(payload).digest("base64url");
}

/**
 * Issuance is the authorization boundary: this is called only from the
 * RBAC-gated controller route (tenant_owner/location_manager), never from
 * the public recording-serving route — which trusts the signature alone,
 * exactly like a real pre-signed object-store URL would.
 */
export function issueSignedRecordingToken(
  config: RecordingStorageConfig,
  objectKey: string,
  ttlSeconds: number,
): { token: string; expiresAt: Date } {
  const expiresAtEpochSeconds = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = Buffer.from(JSON.stringify({ objectKey, expiresAtEpochSeconds })).toString("base64url");
  const signature = sign(config, payload);
  return { token: `${payload}.${signature}`, expiresAt: new Date(expiresAtEpochSeconds * 1000) };
}

/** Returns null for a malformed token, a bad signature, or an expired one — the caller never learns which. */
export function verifySignedRecordingToken(
  config: RecordingStorageConfig,
  token: string,
): SignedRecordingToken | null {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [payload, signature] = parts as [string, string];
  const expectedSignature = sign(config, payload);

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  let decoded: { objectKey?: unknown; expiresAtEpochSeconds?: unknown };
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
  if (typeof decoded.objectKey !== "string" || typeof decoded.expiresAtEpochSeconds !== "number") {
    return null;
  }
  if (Math.floor(Date.now() / 1000) > decoded.expiresAtEpochSeconds) {
    return null;
  }
  return { objectKey: decoded.objectKey, expiresAtEpochSeconds: decoded.expiresAtEpochSeconds };
}
