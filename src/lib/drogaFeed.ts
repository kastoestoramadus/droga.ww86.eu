// Pure RSS 2.0 generation for the per-language Droga feeds. No Astro imports,
// so it stays unit-testable; the route files pass config values and the posts
// already filtered by the site's own draft/future rules (getSinglePage).

import type { SiteUrlConfig } from "./drogaSharingMetadata";

export interface FeedPost {
  slug: string;
  title: string;
  description?: string;
  date?: Date;
}

export interface FeedItem {
  title: string;
  link: string;
  guid: string;
  description: string;
  pubDate?: string;
}

export interface FeedChannelTexts {
  title: string;
  description: string;
}

export interface RssXmlArgs {
  site: SiteUrlConfig;
  language: string;
  texts: FeedChannelTexts;
  items: FeedItem[];
  lastBuild: Date;
}

// Publication-facing feed titles; Polish for the Polish site, English for the
// English one, matching the site's UI-language split.
const feedTitles: Record<string, string> = {
  pl: "wszystkie wpisy",
  en: "all posts",
};

const stripRootSlash = (path: string): string =>
  path === "/" ? "" : path;

const languagePrefix = (site: SiteUrlConfig, language: string): string =>
  language === site.defaultLanguage && !site.defaultLanguageInSubdir
    ? ""
    : `/${language}`;

export const feedPath = (site: SiteUrlConfig, language: string): string =>
  `${stripRootSlash(languagePrefix(site, language))}/rss.xml`;

export const feedUrl = (site: SiteUrlConfig, language: string): string =>
  `${site.baseUrl.replace(/\/$/, "")}${feedPath(site, language)}`;

export const postUrl = (
  site: SiteUrlConfig,
  language: string,
  blogFolder: string,
  slug: string,
): string =>
  `${site.baseUrl.replace(/\/$/, "")}${languagePrefix(site, language)}/${blogFolder}/${slug.replace(/^\//, "")}`;

export const languageHomeUrl = (
  site: SiteUrlConfig,
  language: string,
): string => `${site.baseUrl.replace(/\/$/, "")}${stripRootSlash(languagePrefix(site, language))}`;

// RFC 822 date required by RSS pubDate/lastBuildDate.
export const rfc822Date = (date: Date): string => date.toUTCString();

export const escapeXml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

// Excerpts come from the description frontmatter, never from post bodies; this
// is defence in depth against editor-only source bases or private paths ever
// reaching a feed: HTML comments, editorial/... references and /home/...
// paths are removed and whitespace collapsed.
export const sanitizeExcerpt = (text: string): string =>
  text
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/editorial\/[\w\-./]*[\w-]/g, " ")
    .replace(/\/home\/[\w\-./]*[\w-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Newest first; equal dates fall back to the slug so the order is stable, and
// posts without a date sort last instead of being dropped.
export const feedItems = (
  site: SiteUrlConfig,
  language: string,
  blogFolder: string,
  posts: FeedPost[],
): FeedItem[] =>
  [...posts]
    .sort((a, b) => {
      if (a.date === undefined && b.date === undefined) {
        return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
      }
      if (a.date === undefined) return 1;
      if (b.date === undefined) return -1;
      if (a.date.getTime() !== b.date.getTime()) {
        return b.date.getTime() - a.date.getTime();
      }
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    })
    .map((post) => {
      const link = postUrl(site, language, blogFolder, post.slug);
      return {
        // Text stays raw here; rssXml escapes every field exactly once.
        title: post.title,
        link,
        guid: link,
        description: sanitizeExcerpt(post.description ?? ""),
        ...(post.date ? { pubDate: rfc822Date(post.date) } : {}),
      };
    });

export const rssXml = (args: RssXmlArgs): string => {
  const { site, language, texts, items, lastBuild } = args;
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(texts.title)}</title>`,
    `    <link>${languageHomeUrl(site, language)}</link>`,
    `    <description>${escapeXml(texts.description)}</description>`,
    `    <language>${escapeXml(language)}</language>`,
    `    <lastBuildDate>${rfc822Date(lastBuild)}</lastBuildDate>`,
    `    <atom:link href="${escapeXml(feedUrl(site, language))}" rel="self" type="application/rss+xml"/>`,
  ];
  for (const item of items) {
    lines.push(
      "    <item>",
      `      <title>${escapeXml(item.title)}</title>`,
      `      <link>${item.link}</link>`,
      `      <guid isPermaLink="true">${item.guid}</guid>`,
      `      <description>${escapeXml(item.description)}</description>`,
      ...(item.pubDate ? [`      <pubDate>${item.pubDate}</pubDate>`] : []),
      "    </item>",
    );
  }
  lines.push("  </channel>", "</rss>", "");
  return lines.join("\n");
};

// Head autodiscovery for the feed of the page's own language; languages
// without a known title get no link rather than a guessed one.
export const autodiscoveryLink = (
  site: SiteUrlConfig,
  language: string,
  siteTitle: string,
): { href: string; title: string } | null => {
  const titleTail = feedTitles[language];
  if (titleTail === undefined) return null;
  return {
    href: feedUrl(site, language),
    title: `${siteTitle} — ${titleTail}`,
  };
};
