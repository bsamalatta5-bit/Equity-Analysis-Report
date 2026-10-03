/**
 * A13.3: one place every secret-reading call site in this codebase goes
 * through, so the full inventory in docs/secrets.md is actually
 * enumerable by grepping for `loadSecret(` rather than trusting that list
 * to stay accurate by hand. Deliberately thin: in every environment this
 * build runs in (local dev, CI, and — per docs/secrets.md — staging/
 * production once Terraform exists to provision it) the actual secret
 * value arrives the same way, as an environment variable the runtime was
 * started with. A managed secret store (AWS Secrets Manager, GCP Secret
 * Manager, Azure Key Vault, …) is what populates that environment
 * variable at container start in a real deployment; the application
 * itself never calls out to the store directly, holds a store credential,
 * or needs to change when the store is swapped. That boundary is also why
 * no vendor SDK is pinned here — see docs/secrets.md and
 * docs/adr/version-substitutions.md for the object-storage/payment-vendor
 * precedent for the same "no vendor pinned in Section 3" reasoning.
 */
export function loadSecret(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Required secret "${name}" is not set.`);
  }
  return value;
}

/** For secrets that must decode to an exact byte length (e.g. an AES-256 key). */
export function loadBase64Secret(name: string, expectedByteLength: number, env?: NodeJS.ProcessEnv): Buffer {
  const raw = loadSecret(name, env);
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length !== expectedByteLength) {
    throw new Error(`Secret "${name}" must base64-decode to exactly ${expectedByteLength} bytes.`);
  }
  return decoded;
}
