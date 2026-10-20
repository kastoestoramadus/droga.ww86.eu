// Offline media and public-export audit for Droga publication content.
//
// Usage:
//   node scripts/droga-check-media.mjs [--json FILE] [--dist DIR] [--no-dist]
//
// Walks the repository (no network, no writes outside --json):
//   - src/content: every <img> tag with src/srcset/sizes/width/height/alt/loading/decoding;
//   - public/: served images (existence, intrinsic dimensions, byte sizes, EXIF presence);
//   - editorial/*/originals: author photographs and externally sourced originals
//     (hashes for leak detection, EXIF/GPS presence booleans only, never values);
//   - dist/ (after pnpm build): the export-hygiene check — no editorial path, no
//     byte-identical or same-named original, no editorial reference in llms exports.
//
// Exit status: 0 findings pass (advisories allowed), 1 error findings, 2 usage error.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditExportHygiene,
  auditGallery,
  exifRisk,
  imageDimensions,
  largestAssets,
  mapProvenance,
  parseImgTags,
} from "../src/lib/drogaMediaAudit.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const USAGE = `usage: node scripts/droga-check-media.mjs [--json FILE] [--dist DIR] [--no-dist]`;

function readFlags(argv) {
  const flags = { json: undefined, dist: join(repoRoot, "dist"), noDist: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--json") flags.json = argv[++i];
    else if (argv[i] === "--dist") flags.dist = argv[++i];
    else if (argv[i] === "--no-dist") flags.noDist = true;
    else {
      console.error(`unknown argument: ${argv[i]}\n${USAGE}`);
      process.exit(2);
    }
  }
  return flags;
}

function toPosix(path) {
  return path.split(sep).join("/");
}

function* walkFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(path);
    else if (entry.isFile()) yield path;
  }
}

const sha256Of = (bytes) => `sha256-${createHash("sha256").update(bytes).digest("hex")}`;

function collectPublicImages() {
  const images = new Map();
  const root = join(repoRoot, "public");
  for (const path of walkFiles(root)) {
    if (!/\.(png|jpe?g|webp|gif|avif|svg)$/i.test(path)) continue;
    const bytes = readFileSync(path);
    images.set(`/${toPosix(relative(root, path))}`, { path: `/${toPosix(relative(root, path))}`, bytes, sha256: sha256Of(bytes) });
  }
  return images;
}

function collectContentImgs() {
  const imgs = [];
  const root = join(repoRoot, "src/content");
  for (const path of walkFiles(root)) {
    if (!/\.(md|mdx)$/.test(path)) continue;
    const rel = toPosix(relative(repoRoot, path));
    imgs.push(...parseImgTags(readFileSync(path, "utf8"), rel));
  }
  return imgs;
}

function collectOriginals() {
  const originals = [];
  const root = join(repoRoot, "editorial");
  for (const path of walkFiles(root)) {
    if (!/\/originals\//.test(toPosix(path))) continue;
    const bytes = readFileSync(path);
    originals.push({ path: toPosix(relative(repoRoot, path)), bytes, sha256: sha256Of(bytes) });
  }
  return originals;
}

function collectDist(distDir) {
  if (!existsSync(distDir)) return null;
  const files = [];
  const hashes = new Map();
  for (const path of walkFiles(distDir)) {
    const rel = toPosix(relative(distDir, path));
    files.push(rel);
    if (statSync(path).size <= 64 * 1024 * 1024) {
      hashes.set(rel, sha256Of(readFileSync(path)));
    }
  }
  const llmsNames = ["llms.txt", "llms-full.txt"];
  const llmsTexts = llmsNames
    .filter((name) => existsSync(join(distDir, name)))
    .map((name) => readFileSync(join(distDir, name), "utf8"));
  const texts = new Map();
  for (const path of walkFiles(distDir)) {
    if (/\.(html|js|json|txt|xml)$/i.test(path) && statSync(path).size <= 8 * 1024 * 1024) {
      texts.set(toPosix(relative(distDir, path)), readFileSync(path, "utf8"));
    }
  }
  return { dir: distDir, files, hashes, llmsTexts, texts };
}

const flags = readFlags(process.argv.slice(2));
const publicImages = collectPublicImages();
const contentImgs = collectContentImgs();
const originals = collectOriginals();
const dist = flags.noDist ? null : collectDist(flags.dist);

const galleryFindings = auditGallery(contentImgs, publicImages);
const exportFindings =
  dist === null
    ? []
    : auditExportHygiene({
        distFiles: dist.files,
        distHashes: dist.hashes,
        originals: originals.map((o) => ({ path: o.path, sha256: o.sha256 })),
        llmsTexts: dist.llmsTexts,
        distTexts: dist.texts,
      });
const findings = [...galleryFindings, ...exportFindings];
const errors = findings.filter((f) => f.severity === "error");
const advisories = findings.filter((f) => f.severity === "advisory");

const perFile = new Map();
for (const img of contentImgs) {
  const row = perFile.get(img.file) ?? { imgs: 0, lazy: 0, eagerOrAbsent: 0 };
  row.imgs++;
  if (img.loading === "lazy") row.lazy++;
  else row.eagerOrAbsent++;
  perFile.set(img.file, row);
}

const originalRisks = originals.map((o) => ({
  path: o.path,
  bytes: o.bytes.byteLength,
  hasExif: exifRisk(o.bytes).hasExif,
  hasGps: exifRisk(o.bytes).hasGps,
  dimensions: imageDimensions(o.bytes),
}));
const publicRisks = [...publicImages.values()].map((p) => ({
  path: p.path,
  bytes: p.bytes.byteLength,
  hasExif: exifRisk(p.bytes).hasExif,
  hasGps: exifRisk(p.bytes).hasGps,
}));

const provenance = mapProvenance(
  [...publicImages.keys()].filter((p) => /^\/images\/(trees-with-ai|pellet-sifting)\//.test(p)),
  originals.map((o) => o.path),
);

const report = {
  generatedAt: new Date().toISOString(),
  contentImgs: contentImgs.length,
  publicImages: publicImages.size,
  editorialOriginals: originals.length,
  dist: dist === null ? "not-checked" : { dir: toPosix(relative(repoRoot, dist.dir)), files: dist.files.length },
  perFile: Object.fromEntries(perFile),
  findings,
  largestPublicAssets: largestAssets([...publicImages.values()], 10),
  originalMetadataPresence: originalRisks,
  publicMetadataPresence: publicRisks.filter((p) => p.hasExif || p.hasGps),
  provenance,
};

console.log(`Droga media audit: ${contentImgs.length} content imgs, ${publicImages.size} public images, ${originals.length} editorial originals`);
for (const [file, row] of perFile) console.log(`  ${file}: ${row.imgs} imgs (${row.lazy} lazy, ${row.eagerOrAbsent} eager/absent)`);
if (dist === null) console.log("dist: absent or --no-dist; export hygiene NOT checked");
else console.log(`dist: ${dist.files.length} files checked for editorial leaks`);

console.log("\nLargest publicly served assets:");
for (const asset of report.largestPublicAssets) console.log(`  ${String(asset.byteLength).padStart(8)} B  ${asset.path}`);

console.log("\nProvenance (public image -> editorial original):");
for (const row of provenance) {
  console.log(row.matchedOriginal ? `  ${row.publicPath} -> ${row.matchedOriginal}` : `  ${row.publicPath} -> NO matching editorial original (permission must be documented)`);
}

console.log(`\nEditorial originals metadata presence (booleans only): ${originalRisks.filter((r) => r.hasExif).length}/${originalRisks.length} with EXIF, ${originalRisks.filter((r) => r.hasGps).length} with GPS IFD`);
console.log(`Public images with EXIF or GPS: ${report.publicMetadataPresence.length}/${publicImages.size}`);

for (const finding of findings) console.log(`${finding.severity === "error" ? "ERROR" : "adv.  "} ${finding.kind} ${finding.where}: ${finding.detail}`);
console.log(`\n${errors.length} error(s), ${advisories.length} advisory/advisories`);

if (flags.json !== undefined) {
  writeFileSync(flags.json, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`json report: ${flags.json}`);
}
process.exit(errors.length > 0 ? 1 : 0);
