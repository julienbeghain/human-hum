#!/usr/bin/env node
// Tripwire: fails when the total number of test cases drops below the committed
// floor. A known agent failure mode is "fixing" a red test by deleting it or
// weakening its assertion; coverage stays green and nobody notices. This forces
// any reduction to surface as a deliberate edit to scripts/test-count.baseline.json
// in the same diff, where a reviewer (human or the sandcastle Reviewer) sees it.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEST_FILE = /\.test\.tsx?$/;
const TEST_CASE = /(^|[^.\w])(it|test)(\.each\([^)]*\))?\s*\(/g;
const SKIP = new Set([
  "node_modules",
  ".git",
  ".sandcastle",
  "dist",
  ".next",
  ".turbo",
]);

function testFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...testFiles(p));
    else if (TEST_FILE.test(entry.name)) out.push(p);
  }
  return out;
}

const files = testFiles(root);
let count = 0;
for (const file of files) {
  const matches = readFileSync(file, "utf8").match(TEST_CASE);
  count += matches ? matches.length : 0;
}

const { min } = JSON.parse(
  readFileSync(join(root, "scripts", "test-count.baseline.json"), "utf8"),
);

console.log(`Test cases: ${count} (floor: ${min}, files: ${files.length})`);

if (count < min) {
  console.error(
    `\nTest-case count ${count} is below the floor of ${min}.\n` +
      `If you removed tests on purpose, lower "min" in scripts/test-count.baseline.json\n` +
      `in this same change so the reduction is visible in review. Otherwise, restore the tests.`,
  );
  process.exit(1);
}
