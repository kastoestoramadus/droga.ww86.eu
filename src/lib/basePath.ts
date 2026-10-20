// Base-path handling for building the same site under a prefix (gh-pages PR previews
// at /preview/pr-<N>/) and at the production root. The base comes from Vite's
// BASE_URL, which astro.config.mjs sets from SITE_BASE, so one build serves either
// target and client bundles carry the same value as the server.

/** The build's base prefix: "" in production, "/preview/pr-<N>" in a preview. */
export const SITE_BASE = normalizeBase(import.meta.env.BASE_URL);

/** True when this build is served below /preview/, false at the production root. */
export function isPreviewBuild(base: string = SITE_BASE): boolean {
  return base !== "";
}

/**
 * Normalizes a base the way Vite hands it over (undefined, "", "/", "/x" or "/x/")
 * to "" (production root) or "/x" (no trailing slash), so prefixes compare equal.
 */
export function normalizeBase(raw: string | undefined): string {
  if (!raw || raw === "/") {
    return "";
  }
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

/**
 * Prefixes a root-relative URL with the base. Anything Vite did not build for this
 * site (absolute, protocol-relative, anchor-only, mailto, relative paths) and URLs
 * that already carry the base are returned unchanged, so production output stays
 * byte-identical and a prefixed URL is never doubled.
 */
export function withBase(url: string, base: string = SITE_BASE): string {
  if (base === "" || !url.startsWith("/") || url.startsWith("//")) {
    return url;
  }
  const [path, ...suffix] = url.split(/(?=[?#])/);
  if (path === base) {
    return [base + "/", ...suffix].join("");
  }
  if (path.startsWith(base + "/")) {
    return url;
  }
  return [base + path, ...suffix].join("");
}

/**
 * Removes the base prefix from a pathname when it is really the base ("/preview/pr-7"
 * must not strip a "/preview/pr-77" path); anything else comes back unchanged.
 */
export function stripBase(pathname: string, base: string = SITE_BASE): string {
  if (base === "") {
    return pathname;
  }
  if (pathname === base) {
    return "";
  }
  if (pathname.startsWith(base + "/")) {
    return pathname.slice(base.length);
  }
  return pathname;
}
