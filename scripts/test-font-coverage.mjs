// After build: every web font family must cover the Polish letters. The Font API downloads only
// the subsets it is given (Astro's default is latin alone), and a browser draws a letter outside
// every unicode-range of a family with the next font in the stack, so "żółć" came out with ż, ł and ć
// in Arial and ó in Heebo.
// Usage: node scripts/test-font-coverage.mjs [dist-dir]
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dist = process.argv[2] || "dist";
const html = readFileSync(join(dist, "index.html"), "utf8");
const polish = "ąćęłńóśźżĄĆĘŁŃÓŚŹŻ";

function parseRange(range) {
  return range.split(",").map((part) => {
    const [from, to] = part.trim().replace(/^U\+/i, "").split("-");
    return [parseInt(from, 16), parseInt(to ?? from, 16)];
  });
}

// font-family -> list of [from, to] ranges of its downloaded faces (local() fallbacks skipped)
const families = new Map();
for (const [, body] of html.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
  if (!/src:\s*url\(/.test(body)) continue;
  const family = body.match(/font-family:\s*([^;]+);/)[1].trim().replace(/^"|"$/g, "");
  const range = body.match(/unicode-range:\s*([^;]+);/)?.[1];
  const ranges = range ? parseRange(range) : [[0, 0x10ffff]];
  families.set(family, [...(families.get(family) ?? []), ...ranges]);
}

assert.ok(families.size > 0, `no downloaded @font-face in ${dist}/index.html`);
const failures = [];
for (const [family, ranges] of families) {
  const missing = [...polish].filter((ch) => {
    const code = ch.codePointAt(0);
    return !ranges.some(([from, to]) => code >= from && code <= to);
  });
  if (missing.length) failures.push(`${family}: no face covers ${missing.join(" ")}`);
}
assert.deepEqual(failures, [], `Polish letters outside the web fonts:\n${failures.join("\n")}`);
console.log(`font coverage: ${families.size} families cover ${polish}`);
