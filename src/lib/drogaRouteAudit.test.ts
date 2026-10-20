import { expect, test } from "vitest";
import {
  auditLinks,
  classifyRoute,
  fileForSitePath,
  guardTarget,
  routeKindCounts,
  sitePathOf,
  type BuiltPage,
  type PageLink,
} from "./drogaRouteAudit";

const siteHost = "droga.ww86.eu";

test("routes are classified into canonical Polish, English translations and the Polish copy", () => {
  expect(classifyRoute("/")).toBe("polish-canonical");
  expect(classifyRoute("/blog/ai-i-szesc-drzew")).toBe("polish-canonical");
  expect(classifyRoute("/en/blog/ai-and-six-trees")).toBe("english");
  expect(classifyRoute("/pl/blog/ai-i-szesc-drzew")).toBe("polish-copy");
});

test("route inventory counts every kind, so no route disappears silently", () => {
  expect(routeKindCounts(["/", "/about", "/en/about", "/pl/about", "/en/blog/x"])).toEqual({
    "polish-canonical": 2,
    english: 2,
    "polish-copy": 1,
  });
});

test("internal hrefs keep their query and fragment apart and drop a trailing slash", () => {
  expect(sitePathOf("/blog/x/", "/en/about", siteHost)).toEqual({
    kind: "internal",
    path: "/blog/x",
    fragment: null,
  });
  expect(sitePathOf("/blog/x?utm=1", "/en/about", siteHost)).toMatchObject({ path: "/blog/x" });
  expect(sitePathOf("/blog/x#toc", "/en/about", siteHost)).toMatchObject({ fragment: "toc" });
});

test("percent-encoded Polish slugs are decoded before matching a route", () => {
  expect(sitePathOf("/tags/dzia%C5%82anie-spo%C5%82eczne", "/", siteHost)).toMatchObject({
    kind: "internal",
    path: "/tags/działanie-społeczne",
  });
  expect(sitePathOf("/blog/x#co-uda%C5%82o-mi-si%C4%99-zrobi%C4%87", "/", siteHost)).toMatchObject({
    fragment: "co-udało-mi-się-zrobić",
  });
});

test("absolute URLs of the site itself are internal, other hosts are external", () => {
  expect(sitePathOf("https://droga.ww86.eu/en/blog/x", "/", siteHost)).toMatchObject({
    kind: "internal",
    path: "/en/blog/x",
  });
  expect(sitePathOf("https://example.com/en/blog/x", "/", siteHost).kind).toBe("external");
  expect(sitePathOf("//example.com/x", "/", siteHost).kind).toBe("external");
});

test("a lone fragment stays on its own page, relative hrefs resolve against the page directory", () => {
  expect(sitePathOf("#toc", "/en/blog/x", siteHost)).toEqual({
    kind: "internal",
    path: null,
    fragment: "toc",
  });
  expect(sitePathOf("../page/2/", "/en/blog/x", siteHost)).toMatchObject({ path: "/en/page/2" });
});

test("non-navigation schemes are recognised, not validated", () => {
  for (const href of ["mailto:a@b.c", "tel:+48123", "javascript:void(0)", "data:text/plain,x"]) {
    expect(sitePathOf(href, "/", siteHost).kind).toBe("non-navigation");
  }
});

test("a built route maps to its directory index, a file path maps to itself", () => {
  expect(fileForSitePath("/")).toBe("index.html");
  expect(fileForSitePath("/blog/page/2")).toBe("blog/page/2/index.html");
  expect(fileForSitePath("/blog.md")).toBe("blog.md");
  expect(fileForSitePath("/images/favicon.png")).toBe("images/favicon.png");
});

const identity = (p: string) => p;

test("the guard rejects traversal out of the build root", () => {
  expect(guardTarget("/srv/dist", "/../etc/passwd", identity)).toBe("traversal");
  expect(guardTarget("/srv/dist", "/blog/../../x", identity)).toBe("traversal");
  expect(guardTarget("/srv/dist", "/about", identity)).toBe("ok");
});

test("the guard rejects a symlink that resolves outside the build root and reports missing files", () => {
  const evil = (p: string) => (p.endsWith("images/evil.png") ? "/etc/passwd" : p);
  expect(guardTarget("/srv/dist", "/images/evil.png", evil)).toBe("symlink-escape");
  const absent = () => {
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  };
  expect(guardTarget("/srv/dist", "/gone", absent)).toBe("missing");
});

const page = (path: string, anchors: readonly string[] = []): BuiltPage => ({
  path,
  anchors: new Set(anchors),
});

const options = {
  siteHost,
  defaultLanguage: "pl",
  prefixedLanguages: ["en"],
  knownFiles: new Set(["images/favicon.png", "blog.md"]),
};

const navigation = (pagePath: string, href: string): PageLink => ({ page: pagePath, href, kind: "navigation" });
const asset = (pagePath: string, href: string): PageLink => ({ page: pagePath, href, kind: "asset" });

test("a complete local link set has no problems and counts skipped external links", () => {
  const pages = [page("/", ["top"]), page("/en/blog/x", ["toc"]), page("/tags/działanie-społeczne")];
  const links = [
    navigation("/", "/en/blog/x#toc"),
    navigation("/", "/en/blog/x/"),
    navigation("/", "/tags/dzia%C5%82anie-spo%C5%82eczne?ref=menu"),
    navigation("/en/blog/x", "#toc"),
    navigation("/en/blog/x", "https://example.com/away"),
    asset("/", "/images/favicon.png"),
    navigation("/", "/blog.md"),
    navigation("/", "mailto:a@b.c"),
  ];
  expect(auditLinks(pages, links, options)).toEqual({
    problems: [],
    externalSkipped: 1,
    nonNavigationSkipped: 1,
  });
});

test("a destination no build provides is a problem", () => {
  const pages = [page("/")];
  expect(auditLinks(pages, [navigation("/", "/en/missing")], options).problems).toEqual([
    '[/] /en/missing: no built page or file at "/en/missing"',
  ]);
});

test("a fragment missing on the destination page and one missing on the same page are problems", () => {
  const pages = [page("/en/blog/x", ["toc"]), page("/")];
  const problems = auditLinks(
    pages,
    [navigation("/", "/en/blog/x#nope"), navigation("/en/blog/x", "#gone")],
    options,
  ).problems;
  expect(problems).toEqual([
    '[/] /en/blog/x#nope: fragment "nope" missing on "/en/blog/x"',
    '[/en/blog/x] #gone: fragment "gone" missing on "/en/blog/x"',
  ]);
});

test("a traversal href is reported instead of being read", () => {
  const problems = auditLinks([page("/")], [navigation("/", "/../../etc/passwd")], options).problems;
  expect(problems[0]).toContain("outside the build root");
});

test("a translation destination must use the right language prefix", () => {
  const pages = [page("/en/about"), page("/about"), page("/pl/about")];
  const link = (href: string, language: string): PageLink => ({ page: "/en/about", href, kind: "translation", language });
  const problems = auditLinks(
    pages,
    [link("/about", "en"), link("/pl/about", "pl"), link("/en/about", "pl"), link("/en/gone", "en")],
    options,
  ).problems;
  expect(problems).toEqual([
    '[/en/about] /about (translation en): destination must be under /en/, got "/about"',
    '[/en/about] /pl/about (translation pl): destination must be the canonical route, got "/pl/about"',
    '[/en/about] /en/about (translation pl): destination must be the canonical route, got "/en/about"',
    '[/en/about] /en/gone (translation en): no built page or file at "/en/gone"',
  ]);
});

test("the language switcher of a page is audited like translation links", () => {
  const enAbout: BuiltPage = {
    path: "/en/about",
    anchors: new Set<string>(),
    translations: [
      { language: "pl", path: "/about" },
      { language: "en", path: "/en/about" },
    ],
  };
  expect(auditLinks([page("/about"), enAbout], [], options).problems).toEqual([]);
  const broken: BuiltPage = { ...enAbout, translations: [{ language: "pl", path: "/en/about" }] };
  expect(auditLinks([page("/about"), broken], [], options).problems).toEqual([
    '[/en/about] /en/about (translation pl): destination must be the canonical route, got "/en/about"',
  ]);
});

test("an empty fragment is ignored", () => {
  const pages = [page("/"), page("/en/blog/x")];
  const links = [navigation("/", "#"), navigation("/", "/en/blog/x#"), navigation("/", "/en/blog/x?#")];
  expect(auditLinks(pages, links, options).problems).toEqual([]);
});
