import { describe, expect, it } from "vitest";
import {
  auditExportHygiene,
  auditGallery,
  exifRisk,
  imageDimensions,
  largestAssets,
  mapProvenance,
  parseImgTags,
  parseSrcset,
  type PublicImage,
} from "./drogaMediaAudit.ts";

/** Minimal PNG: signature + IHDR carrying the given canvas size. CRCs are not checked by the parser. */
function pngBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const dv = new DataView(bytes.buffer);
  dv.setUint32(16, width);
  dv.setUint32(20, height);
  return bytes;
}

/** Minimal JPEG: SOI, one APP1 payload (when exif is given), SOF0 with height/width, EOI. */
function jpegBytes(width: number, height: number, app1: Uint8Array | null): Uint8Array {
  const parts: Uint8Array[] = [new Uint8Array([0xff, 0xd8])];
  if (app1) {
    const seg = new Uint8Array(4 + app1.length);
    new DataView(seg.buffer).setUint16(0, 0xffe1);
    new DataView(seg.buffer).setUint16(2, app1.length + 2);
    seg.set(app1, 4);
    parts.push(seg);
  }
  const sof = new Uint8Array(12);
  new DataView(sof.buffer).setUint16(0, 0xffc0);
  new DataView(sof.buffer).setUint16(2, 10);
  new DataView(sof.buffer).setUint16(5, height);
  new DataView(sof.buffer).setUint16(7, width);
  parts.push(sof);
  parts.push(new Uint8Array([0xff, 0xd9]));
  return new Uint8Array(parts.flatMap((p) => [...p]));
}

/** TIFF blob inside APP1 "Exif\0\0" with an IFD0 entry for the GPS IFD pointer (tag 0x8825). */
function exifWithGps(gps: boolean): Uint8Array {
  const tiff = new Uint8Array(22);
  const dv = new DataView(tiff.buffer);
  tiff.set([0x49, 0x49], 0); // little endian
  dv.setUint16(2, 0x2a, true);
  dv.setUint32(4, 8, true); // IFD0 at offset 8
  dv.setUint16(8, gps ? 1 : 0, true); // entry count
  dv.setUint16(10, 0x8825, true); // GPSInfo IFD pointer
  dv.setUint16(12, 4, true);
  dv.setUint32(14, 1, true);
  dv.setUint32(18, 26, true);
  const app1 = new Uint8Array(6 + tiff.length);
  app1.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 0); // "Exif\0\0"
  app1.set(tiff, 6);
  return app1;
}

/** Minimal lossless WebP: RIFF/WEBP container with a VP8L chunk carrying width/height. */
function webpVp8lBytes(width: number, height: number): Uint8Array {
  const chunk = new Uint8Array(9);
  chunk.set([0x56, 0x50, 0x38, 0x4c], 0); // "VP8L"
  chunk[4] = 0x2f; // signature
  const w = width - 1;
  const h = height - 1;
  const bits = w | (h << 14);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(5, bits, true);
  const size = 4 + 5;
  const bytes = new Uint8Array(12 + size);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  new DataView(bytes.buffer).setUint32(4, size + 4, true);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
  bytes.set(chunk, 12);
  return bytes;
}

/** Minimal lossy WebP: RIFF/WEBP container with a VP8 chunk (frame tag, sync code, dimensions). */
function webpVp8Bytes(width: number, height: number): Uint8Array {
  const chunk = new Uint8Array(4 + 4 + 10);
  chunk.set([0x56, 0x50, 0x38, 0x20], 0); // "VP8 "
  new DataView(chunk.buffer).setUint32(4, 10, true); // chunk data size
  chunk.set([0x30, 0x01, 0x00], 8); // frame tag
  chunk.set([0x9d, 0x01, 0x2a], 11); // sync code
  const bytes = new Uint8Array(12 + chunk.length);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  new DataView(bytes.buffer).setUint32(4, chunk.length + 4, true);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set(chunk, 12);
  const dv = new DataView(bytes.buffer);
  dv.setUint16(26, width, true);
  dv.setUint16(28, height, true);
  return bytes;
}

function publicImage(path: string, bytes: Uint8Array): PublicImage {
  return { path, bytes, sha256: `sha-${path}` };
}

describe("parseImgTags", () => {
  const md = [
    "intro",
    `<img src="/images/a.webp" srcset="/images/a-480.webp 480w, /images/a.webp 720w" sizes="(max-width: 640px) 100vw, 360px" width="720" height="960" alt="Alt text one" decoding="async" />`,
    `<img src="/images/b.webp" srcset="/images/b-480.webp 480w, /images/b.webp 720w" width="720" height="960" alt="Alt text two" loading="lazy" decoding="async" />`,
    "outro",
  ].join("\n");

  it("extracts every img with its attributes", () => {
    const imgs = parseImgTags(md, "post.md");
    expect(imgs).toHaveLength(2);
    expect(imgs[0]?.src).toBe("/images/a.webp");
    expect(imgs[0]?.loading).toBeNull();
    expect(imgs[1]?.loading).toBe("lazy");
    expect(imgs.map((i) => i.alt)).toEqual(["Alt text one", "Alt text two"]);
  });

  it("keeps file and index so a finding can name its source place", () => {
    const imgs = parseImgTags(md, "post.md");
    expect(imgs[0]?.file).toBe("post.md");
    expect(imgs[1]?.index).toBe(1);
  });
});

describe("parseSrcset", () => {
  it("splits width descriptors", () => {
    expect(parseSrcset("/a-480.webp 480w, /a.webp 720w")).toEqual([
      { url: "/a-480.webp", width: 480, density: null },
      { url: "/a.webp", width: 720, density: null },
    ]);
  });

  it("keeps density descriptors distinct from widths", () => {
    expect(parseSrcset("/a.webp 1x, /a2.webp 2x")[1]).toEqual({ url: "/a2.webp", width: null, density: 2 });
  });

  it("drops malformed descriptors instead of throwing", () => {
    expect(parseSrcset("/a.webp junk, /b.webp 640w")).toEqual([{ url: "/b.webp", width: 640, density: null }]);
  });
});

describe("imageDimensions", () => {
  it("reads PNG IHDR", () => {
    expect(imageDimensions(pngBytes(640, 480))).toEqual({ format: "png", width: 640, height: 480 });
  });

  it("reads JPEG SOF0", () => {
    expect(imageDimensions(jpegBytes(720, 960, null))).toEqual({ format: "jpeg", width: 720, height: 960 });
  });

  it("reads WebP VP8L", () => {
    expect(imageDimensions(webpVp8lBytes(720, 960))).toEqual({ format: "webp", width: 720, height: 960 });
  });

  it("reads lossy WebP VP8", () => {
    expect(imageDimensions(webpVp8Bytes(720, 960))).toEqual({ format: "webp", width: 720, height: 960 });
  });

  it("returns null for unknown bytes", () => {
    expect(imageDimensions(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});

describe("exifRisk", () => {
  it("detects EXIF with a GPS IFD pointer, reporting booleans only", () => {
    const risk = exifRisk(jpegBytes(720, 960, exifWithGps(true)));
    expect(risk).toEqual({ hasExif: true, hasGps: true });
  });

  it("detects EXIF without GPS", () => {
    const risk = exifRisk(jpegBytes(720, 960, exifWithGps(false)));
    expect(risk).toEqual({ hasExif: true, hasGps: false });
  });

  it("reports no metadata for a clean JPEG", () => {
    expect(exifRisk(jpegBytes(720, 960, null))).toEqual({ hasExif: false, hasGps: false });
  });
});

describe("auditGallery", () => {
  const tag = (attrs: string) => `<img ${attrs} />`;
  const files = new Map<string, PublicImage>([
    ["/images/a.webp", publicImage("/images/a.webp", webpVp8lBytes(720, 960))],
    ["/images/a-480.webp", publicImage("/images/a-480.webp", webpVp8lBytes(480, 640))],
    ["/images/b.webp", publicImage("/images/b.webp", webpVp8lBytes(720, 960))],
    ["/images/b-480.webp", publicImage("/images/b-480.webp", webpVp8lBytes(480, 640))],
  ]);
  const good = [
    tag(`src="/images/a.webp" srcset="/images/a-480.webp 480w, /images/a.webp 720w" width="720" height="960" alt="First alt text long enough" decoding="async"`),
    tag(`src="/images/b.webp" srcset="/images/b-480.webp 480w, /images/b.webp 720w" width="720" height="960" alt="Second alt text long enough" loading="lazy"`),
  ].join("\n");

  it("passes a well-formed gallery", () => {
    expect(auditGallery(parseImgTags(good, "post.md"), files)).toEqual([]);
  });

  it("flags a broken srcset target (fixture: missing 480w file)", () => {
    const imgs = parseImgTags(tag(`src="/images/c.webp" srcset="/images/missing-480.webp 480w, /images/c.webp 720w" width="720" height="960" alt="Some alt text long enough" loading="lazy"`), "post.md");
    const withC = new Map(files);
    withC.set("/images/c.webp", publicImage("/images/c.webp", webpVp8lBytes(720, 960)));
    const findings = auditGallery(imgs, withC);
    expect(findings).toContainEqual(expect.objectContaining({ kind: "missing-srcset-target", severity: "error" }));
  });

  it("flags a missing src file", () => {
    const imgs = parseImgTags(tag(`src="/images/gone.webp" srcset="/images/gone-480.webp 480w" width="480" height="640" alt="An alt text long enough here"`), "post.md");
    expect(auditGallery(imgs, files).map((f) => f.kind)).toContain("missing-src");
  });

  it("flags non-ascending srcset widths", () => {
    const imgs = parseImgTags(tag(`src="/images/a.webp" srcset="/images/a.webp 720w, /images/a-480.webp 480w" width="720" height="960" alt="An alt text long enough here"`), "post.md");
    expect(auditGallery(imgs, files).map((f) => f.kind)).toContain("srcset-order");
  });

  it("flags an aspect ratio that disagrees with the file", () => {
    const imgs = parseImgTags(tag(`src="/images/a.webp" srcset="/images/a-480.webp 480w, /images/a.webp 720w" width="960" height="720" alt="An alt text long enough here"`), "post.md");
    expect(auditGallery(imgs, files).map((f) => f.kind)).toContain("aspect-mismatch");
  });

  it("flags a missing alt or a filename echo, and missing dimensions, as advisories", () => {
    const imgs = parseImgTags(
      [tag(`src="/images/a.webp" srcset="/images/a.webp 720w" alt=""`), tag(`src="/images/b.webp" srcset="/images/b.webp 720w" alt="b"`)].join("\n"),
      "post.md",
    );
    const kinds = auditGallery(imgs, files).map((f) => f.kind);
    expect(kinds).toContain("alt-presence");
    expect(kinds).toContain("missing-dimensions");
    expect(auditGallery(imgs, files).every((f) => f.severity === "advisory" || f.kind !== "alt-presence")).toBe(true);
  });

  it("advises when later images are not lazy and when the first image is lazy", () => {
    const imgs = parseImgTags(
      [
        tag(`src="/images/a.webp" srcset="/images/a.webp 720w" width="720" height="960" alt="First alt text long enough" loading="lazy"`),
        tag(`src="/images/b.webp" srcset="/images/b.webp 720w" width="720" height="960" alt="Second alt text long enough"`),
      ].join("\n"),
      "post.md",
    );
    const details = auditGallery(imgs, files).filter((f) => f.kind === "loading-policy");
    expect(details).toHaveLength(2);
  });
});

describe("auditExportHygiene", () => {
  const originals = [
    { path: "editorial/pellet-sifting/originals/1-28046.jpg", sha256: "sha-orig-1" },
    { path: "editorial/trees-with-ai/originals/d1-trunk.jpg", sha256: "sha-orig-2" },
  ];

  it("passes a clean dist and clean llms exports", () => {
    expect(
      auditExportHygiene({
        distFiles: ["index.html", "images/trees-with-ai/d1-trunk.webp"],
        distHashes: new Map([["images/trees-with-ai/d1-trunk.webp", "sha-webp"]]),
        originals,
        llmsTexts: ["# Droga", "posts follow"],
      }),
    ).toEqual([]);
  });

  it("flags an accidentally exported source-base directory (fixture)", () => {
    const findings = auditExportHygiene({
      distFiles: ["index.html", "editorial/pellet-sifting/originals/1-28046.jpg"],
      distHashes: new Map([["editorial/pellet-sifting/originals/1-28046.jpg", "sha-orig-1"]]),
      originals,
      llmsTexts: [],
    });
    expect(findings.map((f) => f.kind)).toEqual(expect.arrayContaining(["editorial-path-in-dist", "original-bytes-in-dist"]));
    expect(findings.every((f) => f.severity === "error")).toBe(true);
  });

  it("flags an original copied under a different path by hash or by basename", () => {
    const findings = auditExportHygiene({
      distFiles: ["assets/renamed.jpg", "gallery/d1-trunk.jpg"],
      distHashes: new Map([
        ["assets/renamed.jpg", "sha-orig-1"],
        ["gallery/d1-trunk.jpg", "sha-different"],
      ]),
      originals,
      llmsTexts: [],
    });
    expect(findings.map((f) => f.kind)).toEqual(expect.arrayContaining(["original-bytes-in-dist", "original-name-in-dist"]));
  });

  it("flags an editorial reference inside an llms export", () => {
    const findings = auditExportHygiene({
      distFiles: [],
      distHashes: new Map(),
      originals,
      llmsTexts: ["see editorial/trees-with-ai/source.md for details"],
    });
    expect(findings.map((f) => f.kind)).toContain("editorial-in-llms");
  });

  it("reports a built page that references an editorial path as an advisory", () => {
    const findings = auditExportHygiene({
      distFiles: [],
      distHashes: new Map(),
      originals,
      llmsTexts: [],
      distTexts: new Map([["blog/post/index.html", "<!-- Source base: editorial/trees-with-ai/source.md -->"]]),
    });
    expect(findings).toEqual([
      expect.objectContaining({ kind: "editorial-reference-in-dist", severity: "advisory", where: "blog/post/index.html" }),
    ]);
  });
});

describe("largestAssets", () => {
  it("orders by bytes and cuts to the requested count", () => {
    const top = largestAssets(
      [
        { path: "/a.webp", bytes: new Uint8Array(10) },
        { path: "/b.webp", bytes: new Uint8Array(30) },
        { path: "/c.webp", bytes: new Uint8Array(20) },
      ],
      2,
    );
    expect(top.map((a) => a.path)).toEqual(["/b.webp", "/c.webp"]);
    expect(top[0]).toMatchObject({ path: "/b.webp", byteLength: 30 });
  });
});

describe("mapProvenance", () => {
  it("maps public stems to editorial originals, stripping suffixes like -official and -480", () => {
    const rows = mapProvenance(
      ["/images/trees-with-ai/d1-trunk.webp", "/images/trees-with-ai/d1-trunk-480.webp", "/images/pellet-sifting/peewee-ecominor.webp", "/images/trees-with-ai/d1-crown.webp"],
      ["editorial/trees-with-ai/originals/d1-trunk.jpg", "editorial/pellet-sifting/originals/peewee-ecominor-official.jpg"],
    );
    const byPath = new Map(rows.map((r) => [r.publicPath, r]));
    expect(byPath.get("/images/trees-with-ai/d1-trunk.webp")).toMatchObject({ matchedOriginal: "editorial/trees-with-ai/originals/d1-trunk.jpg", source: "editorial-original" });
    expect(byPath.get("/images/trees-with-ai/d1-trunk-480.webp")).toMatchObject({ source: "editorial-original" });
    expect(byPath.get("/images/pellet-sifting/peewee-ecominor.webp")).toMatchObject({ source: "editorial-original" });
    expect(byPath.get("/images/trees-with-ai/d1-crown.webp")).toMatchObject({ matchedOriginal: null, source: "no-matching-editorial-original" });
  });
});
