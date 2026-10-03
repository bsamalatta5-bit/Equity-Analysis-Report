import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A13.9: `dangerouslySetInnerHTML` is React's one escape hatch out of
 * JSX's automatic text escaping — every user-controlled string this app
 * renders (knowledge answers, contact/staff names, service names, …)
 * stays safe from stored XSS specifically because nothing here ever opts
 * out of that escaping. A13.8's stored-XSS spec proves this behaviorally
 * for one field; this proves it structurally for the whole app, so a
 * future screen can't reintroduce the hole one `dangerouslySetInnerHTML`
 * at a time.
 */
const SCAN_ROOT = __dirname;
const PATTERN = /dangerouslySetInnerHTML/;

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listSourceFiles(fullPath));
    } else if ((entry.endsWith(".ts") || entry.endsWith(".tsx")) && !entry.endsWith(".spec.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("Static scan: no dangerouslySetInnerHTML anywhere in apps/dashboard/src (A13.9)", () => {
  it("the scan's own pattern actually matches real usage (sanity check against a synthetic example)", () => {
    const syntheticOffender = `<div dangerouslySetInnerHTML={{ __html: userInput }} />`;
    expect(PATTERN.test(syntheticOffender)).toBe(true);
  });

  it("no file in apps/dashboard/src uses dangerouslySetInnerHTML", () => {
    const offenders: string[] = [];
    for (const filePath of listSourceFiles(SCAN_ROOT)) {
      const contents = readFileSync(filePath, "utf-8");
      if (PATTERN.test(contents)) {
        offenders.push(relative(SCAN_ROOT, filePath).replace(/\\/g, "/"));
      }
    }
    expect(offenders).toEqual([]);
  });
});
