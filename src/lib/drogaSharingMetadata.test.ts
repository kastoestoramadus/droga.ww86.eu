import { describe, expect, test } from "vitest";
import {
  absoluteAssetUrl,
  alternateLinks,
  canonicalUrl,
  resolveOgImage,
  type PostSlugIndex,
  type SiteUrlConfig,
} from "./drogaSharingMetadata";

// Mirrors src/config/config.json of this site.
const site: SiteUrlConfig = {
  baseUrl: "https://droga.ww86.eu",
  basePath: "/",
  defaultLanguage: "pl",
  defaultLanguageInSubdir: false,
  trailingSlash: false,
};

// Real paired posts: slugs differ between languages.
const slugs: PostSlugIndex = {
  pl: {
    "trees-with-ai": "ai-i-szesc-drzew",
    "pellet-sifting": "przesiewanie-pelletu-w-kuwecie",
  },
  en: {
    "trees-with-ai": "ai-and-six-trees",
    "pellet-sifting": "sifting-pellets-in-the-litter-tray",
  },
};

describe("canonicalUrl", () => {
  test("default Polish post canonicalises to the root route without trailing slash", () => {
    expect(canonicalUrl(site, "/blog/ai-i-szesc-drzew/")).toBe(
      "https://droga.ww86.eu/blog/ai-i-szesc-drzew",
    );
  });

  test("English post canonicalises to the /en route with its own slug", () => {
    expect(canonicalUrl(site, "/en/blog/ai-and-six-trees/")).toBe(
      "https://droga.ww86.eu/en/blog/ai-and-six-trees",
    );
  });

  test("the /pl duplicate of a default-language page canonicalises to the root page", () => {
    expect(canonicalUrl(site, "/pl/blog/ai-i-szesc-drzew/")).toBe(
      "https://droga.ww86.eu/blog/ai-i-szesc-drzew",
    );
    expect(canonicalUrl(site, "/pl/")).toBe("https://droga.ww86.eu/");
  });

  test("root keeps exactly one slash", () => {
    expect(canonicalUrl(site, "/")).toBe("https://droga.ww86.eu/");
  });

  test("trailing slash is kept when the site is configured with one", () => {
    expect(canonicalUrl({ ...site, trailingSlash: true }, "/blog/x")).toBe(
      "https://droga.ww86.eu/blog/x/",
    );
  });

  test("percent-encoded segments are preserved untouched", () => {
    expect(canonicalUrl(site, "/categories/przyroda/")).toBe(
      "https://droga.ww86.eu/categories/przyroda",
    );
  });
});

describe("alternateLinks", () => {
  test("Polish post alternates use each language's own slug, never a prefix swap", () => {
    const links = alternateLinks(site, "/blog/ai-i-szesc-drzew/", ["pl", "en"], slugs);
    expect(links).toEqual([
      { hreflang: "pl", href: "https://droga.ww86.eu/blog/ai-i-szesc-drzew" },
      {
        hreflang: "en",
        href: "https://droga.ww86.eu/en/blog/ai-and-six-trees",
      },
      { hreflang: "x-default", href: "https://droga.ww86.eu/blog/ai-i-szesc-drzew" },
    ]);
  });

  test("English post alternates point back to the Polish slug at the root", () => {
    const links = alternateLinks(site, "/en/blog/sifting-pellets-in-the-litter-tray/", ["pl", "en"], slugs);
    expect(links).toEqual([
      {
        hreflang: "pl",
        href: "https://droga.ww86.eu/blog/przesiewanie-pelletu-w-kuwecie",
      },
      {
        hreflang: "en",
        href: "https://droga.ww86.eu/en/blog/sifting-pellets-in-the-litter-tray",
      },
      {
        hreflang: "x-default",
        href: "https://droga.ww86.eu/blog/przesiewanie-pelletu-w-kuwecie",
      },
    ]);
  });

  test("the /pl duplicate emits the same alternates as the root page", () => {
    expect(alternateLinks(site, "/pl/blog/ai-i-szesc-drzew/", ["pl", "en"], slugs)).toEqual(
      alternateLinks(site, "/blog/ai-i-szesc-drzew/", ["pl", "en"], slugs),
    );
  });

  test("a non-post page swaps only the language prefix", () => {
    expect(alternateLinks(site, "/about/", ["pl", "en"], slugs)).toEqual([
      { hreflang: "pl", href: "https://droga.ww86.eu/about" },
      { hreflang: "en", href: "https://droga.ww86.eu/en/about" },
      { hreflang: "x-default", href: "https://droga.ww86.eu/about" },
    ]);
  });

  test("a post without a pair only lists languages that exist", () => {
    const unpaired: PostSlugIndex = { pl: { alone: "samotny-wpis" }, en: {} };
    expect(alternateLinks(site, "/blog/samotny-wpis/", ["pl", "en"], unpaired)).toEqual([
      { hreflang: "pl", href: "https://droga.ww86.eu/blog/samotny-wpis" },
      { hreflang: "x-default", href: "https://droga.ww86.eu/blog/samotny-wpis" },
    ]);
  });

  test("a post route with no translationKey gets no alternates rather than a guessed prefix swap", () => {
    const unkeyed: PostSlugIndex = { pl: {}, en: {} };
    expect(alternateLinks(site, "/blog/ney-post/", ["pl", "en"], unkeyed)).toEqual([]);
  });

  test("default language in a subdirectory keeps its prefix", () => {
    const sub: SiteUrlConfig = { ...site, defaultLanguageInSubdir: true };
    expect(alternateLinks(sub, "/pl/blog/x/", ["pl", "en"], { pl: { k: "x" }, en: { k: "y" } })).toEqual([
      { hreflang: "pl", href: "https://droga.ww86.eu/pl/blog/x" },
      { hreflang: "en", href: "https://droga.ww86.eu/en/blog/y" },
      { hreflang: "x-default", href: "https://droga.ww86.eu/pl/blog/x" },
    ]);
  });
});

describe("share image", () => {
  test("a post image wins and becomes absolute", () => {
    expect(resolveOgImage("/images/trees-with-ai/d1-crown.webp", "/images/og-image.png", site)).toBe(
      absoluteAssetUrl(site, "/images/trees-with-ai/d1-crown.webp"),
    );
  });

  test("an empty post image falls back to the existing site image", () => {
    expect(resolveOgImage("", "/images/og-image.png", site)).toBe(
      "https://droga.ww86.eu/images/og-image.png",
    );
  });

  test("no post image and no site image means no image tag", () => {
    expect(resolveOgImage(undefined, "", site)).toBeNull();
  });
});
