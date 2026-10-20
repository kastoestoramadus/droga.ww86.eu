// Prefixes root-absolute URLs in the built HTML so raw <a>/<img> markup inside
// Markdown posts (full-size image links) stays inside a preview build's base
// (/preview/pr-<N>/). Runs after `astro build`; without SITE_BASE it changes
// nothing, so the production build is byte-identical. Component-generated links
// are already base-aware through src/lib/basePath.ts; this only rewrites URL
// attributes, never article text.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "node-html-parser";

const base = process.env.SITE_BASE || "/";

const prefixUrl = (url) =>
  typeof url === "string" &&
  url.startsWith("/") &&
  !url.startsWith("//") &&
  url !== base &&
  !url.startsWith(`${base}/`)
    ? base + url
    : url;

function prefixSrcset(srcset) {
  return srcset
    .split(",")
    .map((candidate) => {
      const [url, ...rest] = candidate.trim().split(/\s+/);
      return [prefixUrl(url), ...rest].join(" ");
    })
    .join(", ");
}

function* htmlFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(path);
    else if (entry.name.endsWith(".html")) yield path;
  }
}

if (base === "/") {
  console.log("prefix-build-html: production build, nothing to do");
  process.exit(0);
}

let rewritten = 0;
for (const file of htmlFiles("dist")) {
  const html = readFileSync(file, "utf8");
  const doc = parse(html);
  for (const el of doc.querySelectorAll("[href],[src],[srcset]")) {
    for (const attr of ["href", "src"]) {
      const value = el.getAttribute(attr);
      if (typeof value === "string" && value.startsWith("/")) {
        el.setAttribute(attr, prefixUrl(value));
      }
    }
    const srcset = el.getAttribute("srcset");
    if (typeof srcset === "string" && srcset.includes("/")) {
      el.setAttribute("srcset", prefixSrcset(srcset));
    }
  }
  const out = doc.toString();
  if (out !== html) {
    writeFileSync(file, out);
    rewritten++;
  }
}
console.log(
  `prefix-build-html: preview base ${base}, rewrote URL attributes in ${rewritten} files`,
);
