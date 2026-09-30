import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A10.4 (the static-scan half — the runtime half is
 * packages/logger/src/redaction.spec.ts's "logger redaction end-to-end"
 * suite): packages/logger/src/logger.ts is the only place in this
 * repository permitted to construct a pino instance directly, per
 * redaction.ts's own comment ("the static scan in Module 10 (A10.4) fails
 * a build that does"). A second pino() call anywhere in production code
 * would be an unredacted logging path this codebase's one guarantee
 * (Constraint 2.5) doesn't actually cover.
 */
const SCAN_ROOTS = ["apps/api/src", "apps/voice-gateway/src", "packages/logger/src"];
const REPO_ROOT = join(__dirname, "../..");
const PINO_CONSTRUCTOR_PATTERN = /\bpino\s*\(/;
const ALLOWED_FILE = "packages/logger/src/logger.ts";

function listTsFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listTsFiles(fullPath));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".spec.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("Static scan: no direct pino() construction outside packages/logger (A10.4)", () => {
  const offenders: string[] = [];

  for (const root of SCAN_ROOTS) {
    for (const filePath of listTsFiles(join(REPO_ROOT, root))) {
      const relativePath = relative(REPO_ROOT, filePath).replace(/\\/g, "/");
      if (relativePath === ALLOWED_FILE) continue;
      const contents = readFileSync(filePath, "utf-8");
      if (PINO_CONSTRUCTOR_PATTERN.test(contents)) {
        offenders.push(relativePath);
      }
    }
  }

  it("found at least the one permitted pino() construction (sanity check that the scan itself works)", () => {
    const loggerFileContents = readFileSync(join(REPO_ROOT, ALLOWED_FILE), "utf-8");
    expect(PINO_CONSTRUCTOR_PATTERN.test(loggerFileContents)).toBe(true);
  });

  it("no production file outside packages/logger/src/logger.ts constructs a pino instance directly", () => {
    expect(offenders).toEqual([]);
  });
});
