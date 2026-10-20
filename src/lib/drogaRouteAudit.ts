import { posix } from "node:path";

/** How a built route relates to the two-language layout of the site. */
export type RouteKind = "polish-canonical" | "english" | "polish-copy";

/**
 * Polish is the default language and lives directly under "/", English translations under "/en/", and
 * the theme also renders a "/pl/" copy of every Polish page. All three kinds are inventoried, never
 * removed: the checker reports counts so a silently dropped route shows up as a mismatch.
 */
export function classifyRoute(path: string): RouteKind {
  if (under(path, "en")) return "english";
  if (under(path, "pl")) return "polish-copy";
  return "polish-canonical";
}

export function routeKindCounts(paths: readonly string[]): Record<RouteKind, number> {
  const counts: Record<RouteKind, number> = { "polish-canonical": 0, english: 0, "polish-copy": 0 };
  for (const path of paths) counts[classifyRoute(path)]++;
  return counts;
}

export type LinkTargetKind = "internal" | "external" | "non-navigation";

export interface ResolvedLink {
  readonly kind: LinkTargetKind;
  /** Decoded site path of an internal target ("/" for the root); null for same-page fragments and non-internal links. */
  readonly path: string | null;
  readonly fragment: string | null;
}

/** Only these schemes name a navigable destination; mailto:, tel:, javascript:, data: and any other
 * scheme are actions or inline data, not links the offline checker validates. */
const NAVIGATION_SCHEMES = ["http", "https"];

/**
 * Turns a raw href into an internal site path, an external URL or a non-navigation scheme.
 * Query strings are accepted and dropped (they never select a file), trailing slashes are normalised
 * away, percent-encoded Polish slugs are decoded, and ".." segments that would climb out of the site
 * root are kept in the path so the audit can report them instead of silently clamping them.
 */
export function sitePathOf(href: string, page: string, siteHost: string): ResolvedLink {
  const trimmed = href.trim();
  if (trimmed === "" || trimmed === "#") return none();

  const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (!NAVIGATION_SCHEMES.includes(scheme)) return none();
    const url = new URL(trimmed);
    if (url.host !== siteHost) return { kind: "external", path: null, fragment: null };
    return internal(safeDecode(url.pathname), safeDecode(url.hash.slice(1)));
  }
  if (trimmed.startsWith("//")) return { kind: "external", path: null, fragment: null };

  const beforeFragment = trimmed.split("#")[0];
  const fragment = trimmed.includes("#") ? safeDecode(trimmed.split("#").slice(1).join("#")) : "";
  const rawPath = beforeFragment.split("?")[0];
  if (rawPath === "") {
    if (fragment !== "") return { kind: "internal", path: null, fragment };
    return none();
  }
  if (rawPath.startsWith("/")) return internal(safeDecode(rawPath), fragment);

  const dir = page === "/" ? "" : page.slice(0, page.lastIndexOf("/"));
  return internal(joinKeepingEscape(dir, safeDecode(rawPath)), fragment);
}

function safeDecode(path: string): string {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

function none(): ResolvedLink {
  return { kind: "non-navigation", path: null, fragment: null };
}

function internal(rawPath: string, rawFragment: string): ResolvedLink {
  const path = stripTrailingSlash(rawPath);
  const fragment = rawFragment === "" ? null : rawFragment;
  if (path === "") return { kind: "internal", path: "/", fragment };
  return { kind: "internal", path, fragment };
}

function stripTrailingSlash(path: string): string {
  if (path === "/" || !path.endsWith("/")) return path;
  return stripTrailingSlash(path.slice(0, -1));
}

/** Lexical join that keeps leading ".." segments instead of clamping them at the site root. */
function joinKeepingEscape(dir: string, rel: string): string {
  const stack: string[] = [];
  for (const segment of `${dir}/${rel}`.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (stack.length > 0 && stack[stack.length - 1] !== "..") stack.pop();
      else stack.push("..");
    } else stack.push(segment);
  }
  return `/${stack.join("/")}`;
}

/**
 * The built file a site path maps to: routes are directories with an index.html, everything with a
 * dot in its last segment is taken as a file (assets, the llms-style ".md" copies).
 */
export function fileForSitePath(sitePath: string): string {
  const relative = sitePath === "/" ? "" : sitePath.replace(/^\//, "");
  if (relative === "") return "index.html";
  const last = relative.slice(relative.lastIndexOf("/") + 1);
  return last.includes(".") ? relative : `${relative}/index.html`;
}

export type GuardVerdict = "ok" | "traversal" | "symlink-escape" | "missing";

/**
 * Decides whether the checker may read the file a link points at, before anything is opened.
 * ".." segments and a resolution outside the build root are traversal; a symlink whose real path
 * leaves the root is an escape; a target that does not exist is missing. The realpath function is
 * injected so tests stay pure.
 */
export function guardTarget(root: string, sitePath: string, realpath: (file: string) => string): GuardVerdict {
  if (sitePath.split("/").includes("..")) return "traversal";
  const file = posix.resolve(root, fileForSitePath(sitePath));
  if (!isInside(root, file)) return "traversal";
  try {
    if (!isInside(realpath(root), realpath(file))) return "symlink-escape";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    throw error;
  }
  return "ok";
}

function isInside(root: string, candidate: string): boolean {
  const rel = posix.relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !posix.isAbsolute(rel));
}

function under(path: string, language: string): boolean {
  return path === `/${language}` || path.startsWith(`/${language}/`);
}

export interface PageTranslation {
  /** Language switcher option value the data-path belongs to. */
  readonly language: string;
  readonly path: string;
}

export interface BuiltPage {
  /** Site route of the page, "/" for the root, no trailing slash elsewhere. */
  readonly path: string;
  /** Every id attribute and a[name] value found on the page. */
  readonly anchors: ReadonlySet<string>;
  readonly translations?: readonly PageTranslation[];
}

export type LinkKind = "navigation" | "asset" | "translation";

export interface PageLink {
  readonly page: string;
  readonly href: string;
  readonly kind: LinkKind;
  /** Only for kind "translation": the language the destination is supposed to serve. */
  readonly language?: string;
}

export interface AuditOptions {
  readonly siteHost: string;
  /** Language served from the canonical root, without a prefix. */
  readonly defaultLanguage: string;
  /** Languages served under "/<code>/". */
  readonly prefixedLanguages: readonly string[];
  /** Every built file relative to the build root; a destination may be a page or one of these. */
  readonly knownFiles: ReadonlySet<string>;
}

export interface AuditSummary {
  readonly problems: readonly string[];
  readonly externalSkipped: number;
  readonly nonNavigationSkipped: number;
}

/**
 * Audits every collected link of a built site: internal destinations must be a built page or file,
 * fragments must exist on the destination page (or on the page itself), translation switcher targets
 * must sit under their own language prefix — the default language on its canonical route, never the
 * "/pl/" copy or a wrong prefix — and nothing may resolve outside the site root. External URLs are
 * outside this offline check: they are counted and skipped, never fetched. Fragments are only
 * checked on HTML pages; assets have no anchors.
 */
export function auditLinks(
  pages: readonly BuiltPage[],
  links: readonly PageLink[],
  options: AuditOptions,
): AuditSummary {
  const anchorsByPath = new Map(pages.map((p) => [p.path, p.anchors]));
  const problems: string[] = [];
  let externalSkipped = 0;
  let nonNavigationSkipped = 0;

  const all = [
    ...links,
    ...pages.flatMap((p) =>
      (p.translations ?? []).map(
        (t): PageLink => ({ page: p.path, href: t.path, kind: "translation", language: t.language }),
      ),
    ),
  ];

  for (const link of all) {
    const resolved = sitePathOf(link.href, link.page, options.siteHost);
    if (resolved.kind === "non-navigation") {
      nonNavigationSkipped++;
      continue;
    }
    if (resolved.kind === "external") {
      externalSkipped++;
      continue;
    }

    if (resolved.path === null) {
      fragmentProblem(link, resolved.fragment, link.page, anchorsByPath, problems);
      continue;
    }
    if (resolved.path.split("/").includes("..")) {
      problems.push(`[${link.page}] ${link.href}: resolves outside the build root (${resolved.path})`);
      continue;
    }

    const label =
      link.kind === "translation" && link.language !== undefined ? ` (translation ${link.language})` : "";

    if (link.kind === "translation" && link.language !== undefined) {
      if (!translationPrefixOk(resolved.path, link.language, options, link, problems)) continue;
    }

    if (!anchorsByPath.has(resolved.path) && !options.knownFiles.has(fileForSitePath(resolved.path))) {
      problems.push(`[${link.page}] ${link.href}${label}: no built page or file at "${resolved.path}"`);
      continue;
    }
    if (link.kind !== "translation") fragmentProblem(link, resolved.fragment, resolved.path, anchorsByPath, problems);
  }

  return { problems, externalSkipped, nonNavigationSkipped };
}

function fragmentProblem(
  link: PageLink,
  fragment: string | null,
  target: string,
  anchorsByPath: Map<string, ReadonlySet<string>>,
  problems: string[],
): void {
  if (fragment === null || link.kind === "asset") return;
  const anchors = anchorsByPath.get(target);
  if (anchors !== undefined && !anchors.has(fragment)) {
    problems.push(`[${link.page}] ${link.href}: fragment "${fragment}" missing on "${target}"`);
  }
}

function translationPrefixOk(
  path: string,
  language: string,
  options: AuditOptions,
  link: PageLink,
  problems: string[],
): boolean {
  if (options.prefixedLanguages.includes(language)) {
    if (!under(path, language)) {
      problems.push(
        `[${link.page}] ${link.href} (translation ${language}): destination must be under /${language}/, got "${path}"`,
      );
      return false;
    }
    return true;
  }
  if ([options.defaultLanguage, ...options.prefixedLanguages].some((l) => under(path, l))) {
    problems.push(
      `[${link.page}] ${link.href} (translation ${language}): destination must be the canonical route, got "${path}"`,
    );
    return false;
  }
  return true;
}
