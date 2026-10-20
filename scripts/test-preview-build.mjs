// Verifies a preview build (SITE_BASE=/preview/pr-7) against the preview contract.
// Usage: node check-preview-dist.mjs <dist-dir> <base>
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "node-html-parser";

const dist = process.argv[2] ?? "dist";
const base = process.argv[3] ?? "/preview/pr-7";
const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".html")) files.push(p);
  }
})(dist);

const internal = (u) => u.startsWith("/") && !u.startsWith("//");
let htmlChecked = 0;
for (const file of files) {
  const doc = parse(readFileSync(file, "utf8"));
  for (const el of doc.querySelectorAll("[href],[src],[srcset]")) {
    for (const attr of ["href", "src"]) {
      const u = el.getAttribute(attr);
      if (u && internal(u)) {
        assert.ok(
          u === base || u.startsWith(base + "/"),
          `${relative(dist, file)}: ${attr} ${u} escapes the preview prefix`,
        );
      }
    }
    const ss = el.getAttribute("srcset");
    if (ss) {
      for (const cand of ss.split(",")) {
        const u = cand.trim().split(/\s+/)[0];
        if (u && internal(u)) {
          assert.ok(
            u === base || u.startsWith(base + "/"),
            `${relative(dist, file)}: srcset ${u} escapes the preview prefix`,
          );
        }
      }
    }
  }
  // every preview page, nested routes and the 404 included, is noindex,nofollow
  const robots = doc.querySelector('meta[name="robots"]');
  assert.ok(robots, `${relative(dist, file)}: no robots meta`);
  assert.match(
    robots.getAttribute("content") ?? "",
    /noindex,nofollow/,
    `${relative(dist, file)}: robots meta not noindex,nofollow`,
  );
  // production semantics: og:url and canonical never carry the preview prefix
  for (const sel of ['meta[property="og:url"]', 'link[rel="canonical"]']) {
    const el = doc.querySelector(sel);
    const u = el?.getAttribute("content") ?? el?.getAttribute("href");
    if (u) assert.ok(!u.includes(base), `${relative(dist, file)}: ${sel} leaks the preview prefix: ${u}`);
  }
  // language switching stays inside the preview
  for (const opt of doc.querySelectorAll("header select option[data-path]")) {
    const u = opt.getAttribute("data-path");
    if (u && internal(u)) {
      assert.ok(u.startsWith(base + "/"), `${relative(dist, file)}: language target ${u} leaves the preview`);
    }
  }
  htmlChecked++;
}

assert.ok(existsSync(join(dist, "404.html")), "404.html emitted");
assert.ok(existsSync(join(dist, "index.html")), "index.html emitted");
assert.ok(!existsSync(join(dist, "sitemap-index.xml")), "no sitemap in preview");
assert.ok(!existsSync(join(dist, "llms.txt")), "no llms.txt in preview");
assert.match(readFileSync(join(dist, "robots.txt"), "utf8"), /Disallow: \/preview\//);

// share URLs point at the production article, not at the preview copy
let shares = 0;
for (const file of files) {
  const doc = parse(readFileSync(file, "utf8"));
  for (const a of doc.querySelectorAll("article a[aria-label$='share button']")) {
    const u = new URL(a.getAttribute("href").replaceAll("&amp;", "&"));
    const target = new URL(u.searchParams.get(u.hostname.includes("facebook") ? "u" : "url"));
    assert.ok(!target.pathname.startsWith(base), `share URL leaks preview prefix: ${target}`);
    shares++;
  }
}
console.log(`preview contract: ${htmlChecked} HTML files, ${shares} share URLs, all checks passed`);
