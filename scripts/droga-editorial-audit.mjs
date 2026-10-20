#!/usr/bin/env node
// Editorial traceability audit: posts <-> editorial source bases <-> briefs.
//
// Offline checker over public editorial inputs only (src/content/blog, editorial/,
// src/config/language.json); it reads local files and never sends text anywhere.
// It verifies paths and identities (translationKey pairing, source pointers, links,
// unconfirmed-worksheet markers) and nothing else: a pass proves no factual accuracy,
// author approval or style. Exit code 1 only on "error" findings; "missing" marks
// owner input the workflow still awaits and "not-applicable" isolates legacy/demo
// content without an editorial layer. Directories under editorial/ without source.md
// (e.g. templates/) are not editorial bases and are skipped.
//
// Usage: node scripts/droga-editorial-audit.mjs [--json]
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import {
  auditDrogaEditorial,
  extractRepoPaths,
  parseSourceBasePointer,
  scanBriefForUnconfirmedFields,
} from "../src/lib/drogaEditorialAudit.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const languages = JSON.parse(readFileSync(join(root, "src/config/language.json"), "utf8"));

const posts = [];
for (const { languageCode, contentDir } of languages) {
  const dir = join(root, "src/content/blog", contentDir);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".md") && !f.startsWith("-")).sort()) {
    const { data, content } = matter(readFileSync(join(dir, file), "utf8"));
    const pointer = parseSourceBasePointer(content);
    posts.push({
      language: languageCode,
      file,
      path: posix.join("src/content/blog", contentDir, file),
      translationKey: typeof data.translationKey === "string" ? data.translationKey : undefined,
      sourceBase: pointer === undefined ? undefined : pointer.sourceBase,
      pointerKey: pointer === undefined ? undefined : pointer.translationKey,
    });
  }
}

const bases = [];
const briefs = [];
const editorialRoot = join(root, "editorial");
for (const entry of readdirSync(editorialRoot, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .sort((a, b) => a.name.localeCompare(b.name))) {
  const sourcePath = posix.join("editorial", entry.name, "source.md");
  if (!existsSync(join(root, sourcePath))) continue;
  const markdown = readFileSync(join(root, sourcePath), "utf8");
  const linkedPosts = [];
  for (const [, href] of markdown.matchAll(/\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)) {
    if (/^[a-z]+:\/\//i.test(href) || href.startsWith("#")) continue;
    const resolved = posix.normalize(posix.join(posix.dirname(sourcePath), decodeURI(href)));
    if (resolved.startsWith("src/content/blog/")) linkedPosts.push(resolved);
  }
  const briefPath = posix.join("editorial", entry.name, "brief.md");
  const hasBrief = existsSync(join(root, briefPath));
  bases.push({ key: entry.name, dir: `editorial/${entry.name}`, hasSource: true, hasBrief, linkedPosts });
  if (hasBrief) {
    const briefText = readFileSync(join(root, briefPath), "utf8");
    briefs.push({
      key: entry.name,
      path: briefPath,
      unconfirmed: scanBriefForUnconfirmedFields(briefText),
      paths: extractRepoPaths(briefText),
    });
  }
}

const findings = auditDrogaEditorial({
  posts,
  languages: languages.map(({ languageCode }) => languageCode),
  bases,
  briefs,
  exists: (path) => existsSync(join(root, path)),
});

const counts = { error: 0, missing: 0, "not-applicable": 0 };
for (const finding of findings) counts[finding.severity] += 1;

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ tool: "droga-editorial-audit", posts: posts.length, bases: bases.length, counts, findings }, null, 2));
} else {
  const labels = { error: "Errors (broken traceability)", missing: "Missing (owner input the workflow awaits)", "not-applicable": "Not applicable (legacy/demo, no editorial layer)" };
  console.log(`Editorial traceability audit: ${posts.length} posts, ${bases.length} editorial bases`);
  for (const severity of ["error", "missing", "not-applicable"]) {
    console.log(`\n${labels[severity]}: ${counts[severity]}`);
    for (const finding of findings.filter((f) => f.severity === severity)) {
      console.log(`  [${finding.category}] ${finding.subject}: ${finding.message}`);
    }
  }
  console.log("\nPath/identity/marker check only: proves no factual accuracy, author approval or style.");
}

process.exit(counts.error > 0 ? 1 : 0);
