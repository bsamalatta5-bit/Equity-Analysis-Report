#!/usr/bin/env node
// A12.5: every route's first-load JS must gzip to 200KB or less. Reads the
// same app-build-manifest.json Next.js itself uses to print the build's
// "First Load JS" table, so this check cannot drift from what actually
// ships — it does not re-derive route sizes from source.
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BUDGET_BYTES = 200 * 1024;
const dashboardRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const nextDir = join(dashboardRoot, ".next");

function routeNameFromManifestKey(key) {
  return key.replace(/\/page$/, "") || "/";
}

function gzipSize(path) {
  const buffer = readFileSync(path);
  return gzipSync(buffer, { level: 9 }).length;
}

function main() {
  const manifest = JSON.parse(readFileSync(join(nextDir, "app-build-manifest.json"), "utf-8"));
  const sizeCache = new Map();
  const rows = [];
  let anyOverBudget = false;

  for (const [key, chunks] of Object.entries(manifest.pages)) {
    if (!key.endsWith("/page")) {
      continue; // skip layout entries — leaf page entries already include every ancestor layout's chunks.
    }
    const jsChunks = chunks.filter((chunk) => chunk.endsWith(".js"));
    let totalGzipBytes = 0;
    for (const chunk of jsChunks) {
      if (!sizeCache.has(chunk)) {
        sizeCache.set(chunk, gzipSize(join(nextDir, chunk)));
      }
      totalGzipBytes += sizeCache.get(chunk);
    }
    const route = routeNameFromManifestKey(key);
    const overBudget = totalGzipBytes > BUDGET_BYTES;
    anyOverBudget = anyOverBudget || overBudget;
    rows.push({ route, totalGzipBytes, overBudget });
  }

  rows.sort((a, b) => b.totalGzipBytes - a.totalGzipBytes);
  for (const row of rows) {
    const kb = (row.totalGzipBytes / 1024).toFixed(1);
    const flag = row.overBudget ? " OVER BUDGET" : "";
    console.log(`${kb.padStart(7)} kB gzipped  ${row.route}${flag}`);
  }

  if (anyOverBudget) {
    console.error(`\nOne or more routes exceed the ${BUDGET_BYTES / 1024}KB gzipped budget (A12.5).`);
    process.exit(1);
  }
  console.log(`\nAll ${rows.length} routes are within the ${BUDGET_BYTES / 1024}KB gzipped budget (A12.5).`);
}

main();
