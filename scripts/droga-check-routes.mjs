// Offline route checker for the built Droga site: internal page destinations, fragment identifiers,
// local images/assets and language-switcher targets, with a traversal/symlink guard around the build
// root. Complements scripts/test-post-links.mjs, which keeps covering share URLs and the existence
// of translated post pages. External URLs stay outside this check: they are counted, never fetched.
//
// Usage: node scripts/droga-check-routes.mjs [buildRoot]   (default: dist)
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "node-html-parser";
import { auditLinks, guardTarget, routeKindCounts, sitePathOf } from "../src/lib/drogaRouteAudit.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const buildRoot = process.argv[2] ?? "dist";
if (!existsSync(buildRoot)) {
  console.error(`Build root "${buildRoot}" not found; run pnpm build first.`);
  process.exit(1);
}
const rootAbs = resolve(buildRoot);

const config = JSON.parse(readFileSync(join(repoRoot, "src/config/config.json"), "utf8"));
const languages = JSON.parse(readFileSync(join(repoRoot, "src/config/language.json"), "utf8"));
const siteHost = new URL(config.site.base_url).host;
const defaultLanguage = config.settings.default_language;
const prefixedLanguages = languages
  .map((l) => l.languageCode)
  .filter((code) => code !== defaultLanguage && !config.settings.disable_languages.includes(code));

const toPosix = (path) => path.split(sep).join("/");
const guardProblems = [];
const pages = [];
const knownFiles = new Set();

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      guardProblems.push(`symlink inside the build root was not followed: ${toPosix(relative(rootAbs, path))}`);
      continue;
    }
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}

const srcsetUrls = (value) =>
  value
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter((url) => url !== "");

for (const file of walk(buildRoot)) {
  const rel = toPosix(relative(rootAbs, file));
  if (rel === "404.html") {
    // GitHub Pages serves 404.html for the /404 URL (and for every missing path). The theme's demo
    // menu links to /404 ("Strona 404", src/config/menu.pl.json and menu.en.json), so the build
    // does provide that destination.
    pages.push(collectPage(file, "/404"));
  } else if (rel.endsWith("index.html")) {
    const dirRel = rel.slice(0, -"index.html".length);
    pages.push(collectPage(file, dirRel === "" ? "/" : `/${dirRel.slice(0, -1)}`));
  }
  knownFiles.add(rel);
}

function collectPage(file, route) {
  const doc = parse(readFileSync(file, "utf8"));
  const anchors = new Set();
  for (const element of doc.querySelectorAll("[id]")) {
    const id = element.getAttribute("id");
    if (id) anchors.add(id);
  }
  for (const element of doc.querySelectorAll("a[name]")) {
    const name = element.getAttribute("name");
    if (name) anchors.add(name);
  }

  const links = [];
  const add = (kind, rawHref) => {
    if (rawHref !== null && rawHref !== undefined && rawHref !== "") links.push({ page: route, href: rawHref, kind });
  };
  for (const element of doc.querySelectorAll("a[href]")) add("navigation", element.getAttribute("href"));
  for (const element of doc.querySelectorAll("img[src]")) add("asset", element.getAttribute("src"));
  for (const element of doc.querySelectorAll("img[srcset], source[srcset]"))
    for (const url of srcsetUrls(element.getAttribute("srcset") ?? "")) add("asset", url);
  for (const element of doc.querySelectorAll("script[src]")) add("asset", element.getAttribute("src"));
  for (const element of doc.querySelectorAll("link[href][rel]")) {
    const rels = (element.getAttribute("rel") ?? "").toLowerCase().split(/\s+/);
    if (rels.some((r) => ["canonical", "alternate"].includes(r))) add("navigation", element.getAttribute("href"));
    else if (rels.some((r) => ["stylesheet", "icon", "shortcut icon", "apple-touch-icon", "manifest", "preload"].includes(r)))
      add("asset", element.getAttribute("href"));
  }

  const translations = [];
  for (const option of doc.querySelectorAll("option[data-path]")) {
    const language = option.getAttribute("value");
    if (language) translations.push({ language, path: option.getAttribute("data-path") });
  }
  return { page: { path: route, anchors, translations }, links };
}

const collected = pages.map(({ page, links }) => ({ page, links }));
const allLinks = collected.flatMap(({ links }) => links);

for (const { page, href } of allLinks) {
  const resolved = sitePathOf(href, page.path, siteHost);
  if (resolved.kind !== "internal" || resolved.path === null || resolved.path.split("/").includes("..")) continue;
  const verdict = guardTarget(rootAbs, resolved.path, realpathSync);
  if (verdict === "symlink-escape")
    guardProblems.push(`[${page.path}] ${href}: symlink target escapes the build root`);
}

const summary = auditLinks(
  collected.map(({ page }) => page),
  allLinks,
  { siteHost, defaultLanguage, prefixedLanguages, knownFiles },
);
const problems = [...summary.problems, ...guardProblems];

const counts = routeKindCounts(collected.map(({ page }) => page.path));
console.log(`Routes: ${pages.length} pages, ${knownFiles.size} files`);
console.log(
  `  polish-canonical: ${counts["polish-canonical"]}, english: ${counts.english}, polish-copy: ${counts["polish-copy"]} (the /pl/ copy is inventoried, never removed)`,
);
console.log(
  `Links: ${allLinks.length} collected, ${summary.externalSkipped} external skipped (not fetched), ${summary.nonNavigationSkipped} non-navigation skipped`,
);
if (problems.length > 0) {
  console.error(`\n${problems.length} route problem(s):`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log("Route check: all internal destinations, anchors, assets and translation targets passed");
