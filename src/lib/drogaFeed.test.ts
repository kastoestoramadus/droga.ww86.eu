import { describe, expect, test } from "vitest";
import type { SiteUrlConfig } from "./drogaSharingMetadata";
import {
  autodiscoveryLink,
  escapeXml,
  feedItems,
  feedPath,
  feedUrl,
  postUrl,
  rfc822Date,
  rssXml,
  sanitizeExcerpt,
  type FeedPost,
} from "./drogaFeed";

// Mirrors src/config/config.json of this site.
const site: SiteUrlConfig = {
  baseUrl: "https://droga.ww86.eu",
  basePath: "/",
  defaultLanguage: "pl",
  defaultLanguageInSubdir: false,
  trailingSlash: false,
};

// Real paired posts, one date shared by both (as in the live content).
const treesPl: FeedPost = {
  slug: "ai-i-szesc-drzew",
  title: "AI i sześć drzew: od zajawki do zgłoszenia",
  description: "Jak AI pomagało mi pisać do urzędów.",
  date: new Date("2026-10-18T00:00:00Z"),
};
const pelletPl: FeedPost = {
  slug: "przesiewanie-pelletu-w-kuwecie",
  title: "Pellet w kuwecie: przesiewanie na siatce",
  description: "Dwie zwykłe kuwety i siatka jako sito.",
  date: new Date("2026-10-18T00:00:00Z"),
};
const treesEn: FeedPost = {
  slug: "ai-and-six-trees",
  title: "AI and six trees: from an idea to an application",
  description: "How AI helped me write to the authorities.",
  date: new Date("2026-10-18T00:00:00Z"),
};

describe("feedPath / feedUrl", () => {
  test("default Polish feed sits at the root, English under its prefix", () => {
    expect(feedPath(site, "pl")).toBe("/rss.xml");
    expect(feedPath(site, "en")).toBe("/en/rss.xml");
  });

  test("feed URLs are absolute", () => {
    expect(feedUrl(site, "pl")).toBe("https://droga.ww86.eu/rss.xml");
    expect(feedUrl(site, "en")).toBe("https://droga.ww86.eu/en/rss.xml");
  });

  test("the default language moves into a subdir when configured there", () => {
    expect(feedPath({ ...site, defaultLanguageInSubdir: true }, "pl")).toBe(
      "/pl/rss.xml",
    );
  });
});

describe("postUrl", () => {
  test("uses each language's own slug, never a prefix swap", () => {
    expect(postUrl(site, "pl", "blog", treesPl.slug)).toBe(
      "https://droga.ww86.eu/blog/ai-i-szesc-drzew",
    );
    expect(postUrl(site, "en", "blog", treesEn.slug)).toBe(
      "https://droga.ww86.eu/en/blog/ai-and-six-trees",
    );
  });

  test("never appends a trailing slash to a file-style route", () => {
    expect(postUrl({ ...site, trailingSlash: true }, "en", "blog", treesEn.slug)).toBe(
      "https://droga.ww86.eu/en/blog/ai-and-six-trees",
    );
  });
});

describe("escapeXml", () => {
  test("escapes the five XML specials", () => {
    expect(escapeXml(`a & b < c > d "e" 'f'`)).toBe(
      "a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;",
    );
  });

  test("keeps Polish diacritics as UTF-8, not entities", () => {
    expect(escapeXml("sześć żółwi")).toBe("sześć żółwi");
  });
});

describe("rfc822Date", () => {
  test("formats to RFC 822 with a GMT offset and round-trips", () => {
    const date = new Date("2026-10-18T12:34:56Z");
    const text = rfc822Date(date);
    expect(text).toBe("Sun, 18 Oct 2026 12:34:56 GMT");
    expect(new Date(text).toISOString()).toBe(date.toISOString());
  });
});

describe("sanitizeExcerpt", () => {
  test("strips editor-only source-base paths", () => {
    expect(
      sanitizeExcerpt("Wpis. Source base: editorial/trees-with-ai/source.md."),
    ).toBe("Wpis. Source base: .");
  });

  test("strips HTML comments and absolute private paths", () => {
    expect(sanitizeExcerpt("A <!-- note --> B /home/walidus/x/secret.md C")).toBe(
      "A B C",
    );
  });

  test("leaves ordinary text alone", () => {
    expect(sanitizeExcerpt("Zwykły opis, bez ścieżek.")).toBe(
      "Zwykły opis, bez ścieżek.",
    );
  });
});

describe("feedItems", () => {
  test("orders by date descending with a slug tie-break", () => {
    const items = feedItems(site, "pl", "blog", [
      pelletPl,
      treesPl,
      { ...treesEn, slug: "starszy", date: new Date("2026-10-01T00:00:00Z") },
    ]);
    expect(items.map((item) => item.link)).toEqual([
      "https://droga.ww86.eu/blog/ai-i-szesc-drzew",
      "https://droga.ww86.eu/blog/przesiewanie-pelletu-w-kuwecie",
      "https://droga.ww86.eu/blog/starszy",
    ]);
  });

  test("posts without a date sort last and omit pubDate", () => {
    const items = feedItems(site, "pl", "blog", [
      { slug: "bez-daty", title: "Bez daty", description: "x" },
      pelletPl,
    ]);
    expect(items[0]?.link).toContain("przesiewanie-pelletu-w-kuwecie");
    expect(items[0]?.pubDate).toBe("Sun, 18 Oct 2026 00:00:00 GMT");
    expect(items[1]?.pubDate).toBeUndefined();
  });

  test("sanitizes and keeps the description as the excerpt", () => {
    const items = feedItems(site, "pl", "blog", [
      { ...treesPl, description: "Opis editorial/x/source.md i reszta" },
    ]);
    expect(items[0]?.description).toBe("Opis i reszta");
  });
});

describe("rssXml", () => {
  const items = feedItems(site, "pl", "blog", [treesPl, pelletPl]);
  const xml = rssXml({
    site,
    language: "pl",
    texts: { title: "Droga — wszystkie wpisy", description: "Blog osobisty." },
    items,
    lastBuild: new Date("2026-10-20T20:00:00Z"),
  });

  test("declares RSS 2.0 with the Atom namespace and a self link", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">');
    expect(xml).toContain(
      '<atom:link href="https://droga.ww86.eu/rss.xml" rel="self" type="application/rss+xml"/>',
    );
  });

  test("channel carries title, site link, description, language and build date", () => {
    expect(xml).toContain("<title>Droga — wszystkie wpisy</title>");
    expect(xml).toContain("<link>https://droga.ww86.eu</link>");
    expect(xml).toContain("<description>Blog osobisty.</description>");
    expect(xml).toContain("<language>pl</language>");
    expect(xml).toContain("<lastBuildDate>Tue, 20 Oct 2026 20:00:00 GMT</lastBuildDate>");
  });

  test("items link to absolute canonical URLs and are escaped", () => {
    expect(xml).toContain("<link>https://droga.ww86.eu/blog/ai-i-szesc-drzew</link>");
    expect(xml).toContain(
      "<guid isPermaLink=\"true\">https://droga.ww86.eu/blog/ai-i-szesc-drzew</guid>",
    );
    const hostile = rssXml({
      site,
      language: "en",
      texts: { title: "T & <weird>", description: "d" },
      items: [
        {
          title: 'A & B <tag> "q"',
          link: "https://droga.ww86.eu/en/blog/x",
          guid: "https://droga.ww86.eu/en/blog/x",
          description: "<script>alert('x')</script>",
        },
      ],
      lastBuild: new Date("2026-10-20T20:00:00Z"),
    });
    expect(hostile).not.toContain("<script>");
    expect(hostile).toContain("&lt;script&gt;");
    expect(hostile).not.toContain("<tag>");
  });

  test("contains no editorial or private paths anywhere", () => {
    expect(xml).not.toMatch(/editorial\/|\/home\//);
  });
});

describe("autodiscoveryLink", () => {
  test("points Polish pages at the root feed and English pages at /en", () => {
    expect(autodiscoveryLink(site, "pl", "Droga")).toEqual({
      href: "https://droga.ww86.eu/rss.xml",
      title: "Droga — wszystkie wpisy",
    });
    expect(autodiscoveryLink(site, "en", "Droga")).toEqual({
      href: "https://droga.ww86.eu/en/rss.xml",
      title: "Droga — all posts",
    });
  });

  test("an unknown language gets no autodiscovery link", () => {
    expect(autodiscoveryLink(site, "de", "Droga")).toBeNull();
  });
});
