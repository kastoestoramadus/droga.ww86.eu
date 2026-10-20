/**
 * Pure media and public-export audit for Droga publication content.
 *
 * The library never touches the filesystem: the script in
 * scripts/droga-check-media.mjs walks the repo, hashes files and passes
 * strings, byte arrays and file lists in. Everything here is deterministic
 * and safe to run in tests.
 *
 * Privacy rule baked into the API: metadata inspection answers presence
 * questions only (hasExif/hasGps booleans). It never returns or prints
 * coordinates, serial numbers or any other embedded value.
 */

/** An <img> tag as written in a Markdown/HTML source file. */
export interface ImgTag {
  /** Source file the tag was read from, repo-relative posix path. */
  readonly file: string;
  /** Zero-based position of the tag among the imgs of that file. */
  readonly index: number;
  readonly src: string;
  readonly srcset: readonly SrcsetCandidate[];
  readonly sizes: string | null;
  readonly width: string | null;
  readonly height: string | null;
  readonly alt: string | null;
  readonly loading: string | null;
  readonly decoding: string | null;
}

export interface SrcsetCandidate {
  readonly url: string;
  readonly width: number | null;
  readonly density: number | null;
}

export interface ImageDimensions {
  readonly format: "png" | "jpeg" | "webp";
  readonly width: number;
  readonly height: number;
}

/** Presence-only metadata report; no embedded values are ever surfaced. */
export interface ExifRisk {
  readonly hasExif: boolean;
  readonly hasGps: boolean;
}

export type Severity = "error" | "advisory";

export type FindingKind =
  | "missing-src"
  | "missing-srcset-target"
  | "srcset-order"
  | "missing-dimensions"
  | "aspect-mismatch"
  | "alt-presence"
  | "loading-policy"
  | "unknown-format"
  | "editorial-path-in-dist"
  | "original-bytes-in-dist"
  | "original-name-in-dist"
  | "editorial-in-llms";

export interface Finding {
  readonly kind: FindingKind;
  readonly severity: Severity;
  readonly where: string;
  readonly detail: string;
}

/** A file the audit may hash and read, already loaded by the script. */
export interface PublicImage {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly sha256: string;
}

export interface EditorialOriginal {
  readonly path: string;
  readonly sha256: string;
}

export interface ExportHygieneInput {
  readonly distFiles: readonly string[];
  readonly distHashes: ReadonlyMap<string, string>;
  readonly originals: readonly EditorialOriginal[];
  readonly llmsTexts: readonly string[];
}

export type ProvenanceSource = "editorial-original" | "no-matching-editorial-original";

export interface ProvenanceRow {
  readonly publicPath: string;
  readonly matchedOriginal: string | null;
  readonly source: ProvenanceSource;
}

const IMG_TAG = /<img\b[^>]*>/gi;
const ATTRIBUTE = /\b([a-z-]+)\s*=\s*"([^"]*)"/gi;

export function parseImgTags(markdown: string, file: string): readonly ImgTag[] {
  const tags: ImgTag[] = [];
  for (const match of markdown.matchAll(IMG_TAG)) {
    const attrs = new Map<string, string>();
    for (const attr of (match[0] ?? "").matchAll(ATTRIBUTE)) attrs.set(attr[1] ?? "", attr[2] ?? "");
    tags.push({
      file,
      index: tags.length,
      src: attrs.get("src") ?? "",
      srcset: parseSrcset(attrs.get("srcset") ?? ""),
      sizes: attrs.get("sizes") ?? null,
      width: attrs.get("width") ?? null,
      height: attrs.get("height") ?? null,
      alt: attrs.has("alt") ? (attrs.get("alt") ?? "") : null,
      loading: attrs.get("loading") ?? null,
      decoding: attrs.get("decoding") ?? null,
    });
  }
  return tags;
}

export function parseSrcset(srcset: string): readonly SrcsetCandidate[] {
  const candidates: SrcsetCandidate[] = [];
  for (const part of srcset.split(",")) {
    const trimmed = part.trim();
    if (trimmed === "") continue;
    const spaceAt = trimmed.lastIndexOf(" ");
    const url = spaceAt === -1 ? trimmed : trimmed.slice(0, spaceAt);
    const descriptor = spaceAt === -1 ? "" : trimmed.slice(spaceAt + 1);
    if (descriptor === "") candidates.push({ url, width: null, density: null });
    else if (descriptor.endsWith("w")) {
      const width = Number.parseInt(descriptor.slice(0, -1), 10);
      if (Number.isFinite(width)) candidates.push({ url, width, density: null });
    } else if (descriptor.endsWith("x")) {
      const density = Number.parseFloat(descriptor.slice(0, -1));
      if (Number.isFinite(density)) candidates.push({ url, width: null, density });
    }
  }
  return candidates;
}

/** Reads intrinsic dimensions from PNG, JPEG and WebP bytes; null when the format is unknown. */
export function imageDimensions(bytes: Uint8Array): ImageDimensions | null {
  return pngDimensions(bytes) ?? jpegDimensions(bytes) ?? webpDimensions(bytes);
}

function pngDimensions(bytes: Uint8Array): ImageDimensions | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || !signature.every((b, i) => bytes[i] === b)) return null;
  if (ascii(bytes, 12, 4) !== "IHDR") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { format: "png", width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = view.getUint16(offset + 2);
    if ((marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) || marker === 0xf7) {
      return { format: "jpeg", height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    }
    if (marker === 0xda) return null;
    offset += 2 + length;
  }
  return null;
}

function webpDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 16 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8X" && bytes.length >= 30) {
    const width = 1 + ((bytes[24] ?? 0) | ((bytes[25] ?? 0) << 8) | ((bytes[26] ?? 0) << 16));
    const height = 1 + ((bytes[27] ?? 0) | ((bytes[28] ?? 0) << 8) | ((bytes[29] ?? 0) << 16));
    return { format: "webp", width, height };
  }
  if (chunk === "VP8 " && bytes.length >= 30) {
    // Lossy VP8: 3-byte frame tag, 3-byte sync code (9d 01 2a), then 14-bit width and height.
    const width = view.getUint16(26, true) & 0x3fff;
    const height = view.getUint16(28, true) & 0x3fff;
    return { format: "webp", width, height };
  }
  if (chunk === "VP8L" && bytes.length >= 21) {
    const bits = view.getUint32(17, true);
    return { format: "webp", width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

/**
 * Answers whether the bytes carry an EXIF block and whether that block
 * declares a GPS IFD. Presence only: no metadata values are decoded or
 * returned, so the audit can discuss risk without publishing private data.
 */
export function exifRisk(bytes: Uint8Array): ExifRisk {
  const tiff = exifTiff(bytes);
  if (tiff === null) return { hasExif: false, hasGps: false };
  const { view, start } = tiff;
  const little = view.getUint16(start) === 0x4949;
  if (view.getUint16(start + 2, little) !== 0x2a) return { hasExif: true, hasGps: false };
  const ifd0 = start + view.getUint32(start + 4, little);
  if (ifd0 + 2 > view.byteLength) return { hasExif: true, hasGps: false };
  const entries = view.getUint16(ifd0, little);
  for (let i = 0; i < entries; i++) {
    const entry = ifd0 + 2 + i * 12;
    if (entry + 12 > view.byteLength) break;
    const tag = view.getUint16(entry, little);
    if (tag === 0x8825) return { hasExif: true, hasGps: true };
  }
  return { hasExif: true, hasGps: false };
}

/** Locates an EXIF payload (JPEG APP1 or WebP EXIF chunk) and returns its TIFF header view. */
function exifTiff(bytes: Uint8Array): { view: DataView; start: number } | null {
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1];
      if (marker === 0xda || marker === 0xd9) return null;
      const length = view.getUint16(offset + 2);
      if (marker === 0xe1 && ascii(bytes, offset + 4, 6) === "Exif\u0000\u0000") {
        return { view, start: offset + 10 };
      }
      offset += 2 + length;
    }
    return null;
  }
  if (bytes.length >= 16 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const chunk = ascii(bytes, offset, 4);
      const size = bytes[offset + 4] ?? 0;
      if (chunk === "EXIF") {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        return { view, start: offset + 8 };
      }
      offset += 8 + size + (size % 2);
    }
    return null;
  }
  return null;
}

/** Width/height attributes may disagree with the intrinsic ratio by up to this fraction. */
const ASPECT_TOLERANCE = 0.02;

export function auditGallery(imgs: readonly ImgTag[], files: ReadonlyMap<string, PublicImage>): readonly Finding[] {
  const findings: Finding[] = [];
  for (const img of imgs) {
    const where = `${img.file} img#${img.index + 1}`;
    const srcFile = files.get(img.src);
    if (srcFile === undefined) {
      findings.push({ kind: "missing-src", severity: "error", where, detail: `src file not found under public/: ${img.src}` });
    }
    for (const candidate of img.srcset) {
      if (candidate.url !== "" && !files.has(candidate.url)) {
        findings.push({
          kind: "missing-srcset-target",
          severity: "error",
          where,
          detail: `srcset target not found under public/: ${candidate.url}`,
        });
      }
    }
    const widths = img.srcset.map((c) => c.width).filter((w): w is number => w !== null);
    if (widths.length >= 2 && widths.some((w, i) => i > 0 && w <= (widths[i - 1] ?? Number.POSITIVE_INFINITY))) {
      findings.push({ kind: "srcset-order", severity: "error", where, detail: `srcset widths are not ascending: ${widths.join(", ")}` });
    }
    if (img.width === null || img.height === null) {
      findings.push({ kind: "missing-dimensions", severity: "advisory", where, detail: "width/height attributes are incomplete; the browser cannot reserve space" });
    } else if (srcFile !== undefined) {
      const dims = imageDimensions(srcFile.bytes);
      if (dims === null) {
        findings.push({ kind: "unknown-format", severity: "advisory", where, detail: `intrinsic dimensions unreadable: ${img.src}` });
      } else {
        const attrRatio = Number(img.width) / Number(img.height);
        const fileRatio = dims.width / dims.height;
        if (Math.abs(attrRatio / fileRatio - 1) > ASPECT_TOLERANCE) {
          findings.push({
            kind: "aspect-mismatch",
            severity: "error",
            where,
            detail: `attributes ${img.width}x${img.height} disagree with intrinsic ${dims.width}x${dims.height} of ${img.src}`,
          });
        }
      }
    }
    const stem = basename(img.src).replace(/\.[^.]+$/, "");
    if (img.alt === null || img.alt.trim() === "" || img.alt.trim().toLowerCase() === stem.toLowerCase()) {
      findings.push({
        kind: "alt-presence",
        severity: "advisory",
        where,
        detail: img.alt === null ? "alt attribute is missing" : `alt is empty or only echoes the filename: "${img.alt}"`,
      });
    }
    if (img.index === 0 && img.loading === "lazy") {
      findings.push({ kind: "loading-policy", severity: "advisory", where, detail: "first image of the document is lazy-loaded; likely LCP candidate" });
    }
    if (img.index > 0 && img.loading !== "lazy") {
      findings.push({ kind: "loading-policy", severity: "advisory", where, detail: `image ${img.index + 1} of the document is not lazy-loaded (loading="${img.loading ?? "absent"})` });
    }
  }
  return findings;
}

export function auditExportHygiene(input: ExportHygieneInput): readonly Finding[] {
  const findings: Finding[] = [];
  const hashToOriginal = new Map<string, EditorialOriginal>();
  const nameToOriginal = new Map<string, EditorialOriginal>();
  for (const original of input.originals) {
    hashToOriginal.set(original.sha256, original);
    nameToOriginal.set(basename(original.path), original);
  }
  for (const distFile of input.distFiles) {
    if (/(^|\/)editorial(\/|$)/.test(distFile)) {
      findings.push({ kind: "editorial-path-in-dist", severity: "error", where: distFile, detail: "build output contains an editorial source-base path" });
    }
    const byHash = hashToOriginal.get(input.distHashes.get(distFile) ?? "");
    if (byHash !== undefined) {
      findings.push({ kind: "original-bytes-in-dist", severity: "error", where: distFile, detail: `byte-identical copy of ${byHash.path}` });
    }
    const byName = nameToOriginal.get(basename(distFile));
    if (byName !== undefined) {
      findings.push({ kind: "original-name-in-dist", severity: "error", where: distFile, detail: `filename matches editorial original ${byHash?.path ?? byName.path}` });
    }
  }
  input.llmsTexts.forEach((text, i) => {
    if (/editorial\//.test(text)) {
      findings.push({ kind: "editorial-in-llms", severity: "error", where: `llms[${i}]`, detail: "llms export references the editorial source base" });
    }
  });
  return findings;
}

export function largestAssets(
  files: readonly { path: string; bytes: Uint8Array }[],
  topN: number,
): readonly { path: string; byteLength: number }[] {
  return [...files]
    .map((f) => ({ path: f.path, byteLength: f.bytes.byteLength }))
    .sort((a, b) => b.byteLength - a.byteLength || a.path.localeCompare(b.path))
    .slice(0, topN);
}

/** Filename stems like "peewee-ecominor-official" cover public stems like "peewee-ecominor". */
const ORIGINAL_SUFFIXES = ["-official", "-original", "-source"];

export function mapProvenance(publicPaths: readonly string[], originalPaths: readonly string[]): readonly ProvenanceRow[] {
  const stems = new Map<string, string>();
  for (const original of originalPaths) {
    let stem = basename(original).replace(/\.[^.]+$/, "");
    for (const suffix of ORIGINAL_SUFFIXES) {
      if (stem.endsWith(suffix)) stem = stem.slice(0, -suffix.length);
    }
    stems.set(stem, original);
  }
  return publicPaths.map((publicPath) => {
    const stem = basename(publicPath)
      .replace(/\.[^.]+$/, "")
      .replace(/-480$/, "");
    const matched = stems.get(stem) ?? null;
    return { publicPath, matchedOriginal: matched, source: matched === null ? "no-matching-editorial-original" : "editorial-original" };
  });
}

function basename(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}
