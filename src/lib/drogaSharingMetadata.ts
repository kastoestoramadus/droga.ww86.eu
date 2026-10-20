// Pure URL logic for head metadata: canonical URL, hreflang alternates and
// share images. Kept free of Astro imports so it stays unit-testable; page
// code passes config values and the per-language post slug index.

export interface SiteUrlConfig {
  baseUrl: string;
  basePath: string;
  defaultLanguage: string;
  defaultLanguageInSubdir: boolean;
  trailingSlash: boolean;
}

// language -> translationKey -> slug of that language's post.
export type PostSlugIndex = Record<string, Record<string, string>>;

export interface AlternateLink {
  hreflang: string;
  href: string;
}

const stripTrailingSlash = (path: string): string =>
  path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;

const withTrailingSlash = (path: string): string =>
  path.endsWith("/") ? path : `${path}/`;

// Relative path of a pathname, with the redundant default-language prefix
// removed when the default language does not live in a subdirectory.
export const normalizedPath = (site: SiteUrlConfig, pathname: string): string => {
  let path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (site.basePath !== "/") {
    const base = site.basePath.replace(/\/$/, "");
    if (base && path === base) path = "/";
    else if (base && path.startsWith(`${base}/`)) path = path.slice(base.length);
  }
  if (!site.defaultLanguageInSubdir) {
    const prefix = `/${site.defaultLanguage}`;
    if (path === prefix || path === `${prefix}/`) path = "/";
    else if (path.startsWith(`${prefix}/`)) path = path.slice(prefix.length);
  }
  path = `/${path.split("/").filter(Boolean).join("/")}`;
  return site.trailingSlash ? withTrailingSlash(path) : stripTrailingSlash(path);
};

export const canonicalUrl = (site: SiteUrlConfig, pathname: string): string =>
  `${site.baseUrl.replace(/\/$/, "")}${normalizedPath(site, pathname)}`;

// Language of a rendered route: the first path segment when it is a known
// language prefix, otherwise the default language.
const languageOfPath = (site: SiteUrlConfig, pathname: string, languages: string[]): string => {
  const first = pathname.split("/").filter(Boolean)[0];
  return first && languages.includes(first) ? first : site.defaultLanguage;
};

// Pathname relative to its language prefix ("/en/blog/x" -> "/blog/x").
const stripLanguage = (pathname: string, languages: string[]): string => {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length > 0 && languages.includes(segments[0]!)) {
    return `/${segments.slice(1).join("/")}`;
  }
  return `/${segments.join("/")}`;
};

export const alternateLinks = (
  site: SiteUrlConfig,
  pathname: string,
  languages: string[],
  slugIndex: PostSlugIndex,
): AlternateLink[] => {
  const route = stripLanguage(pathname, languages);
  const lang = languageOfPath(site, pathname, languages);

  // A post route pairs through translationKey; each language uses its own slug.
  const postMatch = route.match(/^\/blog\/([^/]+)\/?$/);
  let translationKey: string | undefined;
  if (postMatch) {
    translationKey = Object.keys(slugIndex[lang] ?? {}).find(
      (key) => slugIndex[lang]?.[key] === postMatch[1],
    );
    if (!translationKey) {
      // A post without a shared key has no knowable translated URL; emitting a
      // prefix swap would guess, so no alternates at all.
      return [];
    }
  }

  // Taxonomy term slugs differ per language (przyroda vs nature) and no
  // translation map exists, and no translated 404 route is built; a prefix
  // swap would point at pages that do not exist, so no alternates at all.
  if (
    /^\/(categories|tags)\/[^/]+\/?$/.test(route) ||
    route === "/404"
  ) {
    return [];
  }

  const linkFor = (targetLang: string): string => {
    let target = route;
    if (translationKey) {
      const slug = slugIndex[targetLang]?.[translationKey];
      if (!slug) return "";
      target = `/blog/${slug}`;
    }
    const prefixed =
      targetLang === site.defaultLanguage && !site.defaultLanguageInSubdir
        ? target
        : `/${targetLang}${target === "/" ? "" : target}`;
    return canonicalUrl(site, prefixed);
  };

  const links: AlternateLink[] = [];
  for (const targetLang of languages) {
    const href = linkFor(targetLang);
    if (href) links.push({ hreflang: targetLang, href });
  }
  const fallback = linkFor(site.defaultLanguage);
  if (fallback) links.push({ hreflang: "x-default", href: fallback });
  return links;
};

// Absolute URL of a share image; null when no image exists at all, so the
// caller emits no image tag instead of a broken one.
export const resolveOgImage = (
  postImage: string | undefined,
  siteImage: string,
  site: SiteUrlConfig,
): string | null => {
  const image = postImage || siteImage;
  return image ? absoluteAssetUrl(site, image) : null;
};

export const absoluteAssetUrl = (site: SiteUrlConfig, image: string): string =>
  image.startsWith("http")
    ? image
    : `${site.baseUrl.replace(/\/$/, "")}${image.startsWith("/") ? "" : "/"}${image}`;
