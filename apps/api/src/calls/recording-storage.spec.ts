import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deleteRecording,
  encryptAndStoreRecording,
  issueSignedRecordingToken,
  loadRecordingStorageConfig,
  retrieveAndDecryptRecording,
  verifySignedRecordingToken,
  type RecordingStorageConfig,
} from "./recording-storage";

describe("loadRecordingStorageConfig", () => {
  it("throws when RECORDING_ENCRYPTION_KEY is missing", () => {
    expect(() => loadRecordingStorageConfig({ RECORDING_SIGNING_SECRET: "x" })).toThrow(
      /RECORDING_ENCRYPTION_KEY/,
    );
  });

  it("throws when the encryption key does not decode to 32 bytes", () => {
    expect(() =>
      loadRecordingStorageConfig({
        RECORDING_ENCRYPTION_KEY: Buffer.from("too-short").toString("base64"),
        RECORDING_SIGNING_SECRET: "x",
      }),
    ).toThrow(/32 bytes/);
  });

  it("loads a valid config, defaulting storageDir", () => {
    const config = loadRecordingStorageConfig({
      RECORDING_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
      RECORDING_SIGNING_SECRET: "x",
    });
    expect(config.encryptionKey).toHaveLength(32);
    expect(config.storageDir).toBe("./var/recordings");
  });
});

describe("encryptAndStoreRecording / retrieveAndDecryptRecording (A10.2)", () => {
  let config: RecordingStorageConfig;
  let storageDir: string;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), "recording-storage-test-"));
    config = { storageDir, encryptionKey: randomBytes(32), signingSecret: "test-signing-secret" };
  });

  afterEach(async () => {
    await rm(storageDir, { recursive: true, force: true });
  });

  it("round-trips arbitrary bytes exactly", async () => {
    const plaintext = randomBytes(2048);
    await encryptAndStoreRecording(config, "tenant-1/call-1", plaintext);
    const decrypted = await retrieveAndDecryptRecording(config, "tenant-1/call-1");
    expect(decrypted.equals(plaintext)).toBe(true);
  });

  it("the bytes on disk are not the plaintext — genuinely encrypted, not just relocated", async () => {
    const plaintext = Buffer.from("this must never appear verbatim on disk");
    await encryptAndStoreRecording(config, "tenant-1/call-2", plaintext);
    const onDisk = await readFile(join(storageDir, "tenant-1/call-2.enc"));
    expect(onDisk.includes(plaintext)).toBe(false);
  });

  it("fails to decrypt with the wrong key (authentication tag mismatch)", async () => {
    const plaintext = randomBytes(64);
    await encryptAndStoreRecording(config, "tenant-1/call-3", plaintext);
    const wrongKeyConfig: RecordingStorageConfig = { ...config, encryptionKey: randomBytes(32) };
    await expect(retrieveAndDecryptRecording(wrongKeyConfig, "tenant-1/call-3")).rejects.toThrow();
  });

  it("rejects an object key attempting path traversal", async () => {
    await expect(encryptAndStoreRecording(config, "../../etc/passwd", randomBytes(8))).rejects.toThrow(
      /Invalid recording object key/,
    );
  });

  it("deleteRecording removes the encrypted object; a second delete is a no-op", async () => {
    await encryptAndStoreRecording(config, "tenant-1/call-4", randomBytes(16));
    await deleteRecording(config, "tenant-1/call-4");
    await expect(retrieveAndDecryptRecording(config, "tenant-1/call-4")).rejects.toThrow();
    await expect(deleteRecording(config, "tenant-1/call-4")).resolves.not.toThrow();
  });
});

describe("issueSignedRecordingToken / verifySignedRecordingToken (A10.2)", () => {
  const config: RecordingStorageConfig = {
    storageDir: "/unused",
    encryptionKey: randomBytes(32),
    signingSecret: "test-signing-secret",
  };

  it("a freshly issued token verifies and carries the correct objectKey", () => {
    const { token } = issueSignedRecordingToken(config, "tenant-1/call-5", 300);
    const verified = verifySignedRecordingToken(config, token);
    expect(verified?.objectKey).toBe("tenant-1/call-5");
  });

  it("expiresAt is 300 seconds out, matching THRESHOLDS.RECORDING_SIGNED_URL_TTL_SECONDS", () => {
    const before = Date.now();
    const { expiresAt } = issueSignedRecordingToken(config, "tenant-1/call-5", 300);
    const deltaSeconds = (expiresAt.getTime() - before) / 1000;
    expect(deltaSeconds).toBeGreaterThan(295);
    expect(deltaSeconds).toBeLessThanOrEqual(300);
  });

  it("rejects a token signed with a different secret", () => {
    const { token } = issueSignedRecordingToken(config, "tenant-1/call-6", 300);
    const otherConfig: RecordingStorageConfig = { ...config, signingSecret: "a-different-secret" };
    expect(verifySignedRecordingToken(otherConfig, token)).toBeNull();
  });

  it("rejects a tampered payload even with a structurally valid token", () => {
    const { token } = issueSignedRecordingToken(config, "tenant-1/call-7", 300);
    const [payload, signature] = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({ objectKey: "tenant-1/someone-elses-call", expiresAtEpochSeconds: 9_999_999_999 }),
    ).toString("base64url");
    expect(verifySignedRecordingToken(config, `${tamperedPayload}.${signature}`)).toBeNull();
    void payload;
  });

  it("rejects an expired token", () => {
    const { token } = issueSignedRecordingToken(config, "tenant-1/call-8", -1);
    expect(verifySignedRecordingToken(config, token)).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(verifySignedRecordingToken(config, "not-a-valid-token")).toBeNull();
    expect(verifySignedRecordingToken(config, "")).toBeNull();
  });
});
