import { describe, expect, test } from "vitest";
import { isPreviewBuild, normalizeBase, stripBase, withBase } from "./basePath";

describe("normalizeBase", () => {
  test("accepts the Vite shapes of a root base", () => {
    expect(normalizeBase(undefined)).toBe("");
    expect(normalizeBase("")).toBe("");
    expect(normalizeBase("/")).toBe("");
  });

  test("keeps a preview prefix without a trailing slash", () => {
    expect(normalizeBase("/preview/pr-7")).toBe("/preview/pr-7");
    expect(normalizeBase("/preview/pr-7/")).toBe("/preview/pr-7");
  });
});

describe("withBase", () => {
  test("prefixes root-relative URLs", () => {
    expect(withBase("/blog", "/preview/pr-7")).toBe("/preview/pr-7/blog");
    expect(withBase("/images/favicon.png", "/preview/pr-7")).toBe(
      "/preview/pr-7/images/favicon.png",
    );
  });

  test("maps the site root to the preview root", () => {
    expect(withBase("/", "/preview/pr-7")).toBe("/preview/pr-7/");
  });

  test("keeps production URLs untouched without a base", () => {
    expect(withBase("/blog", "")).toBe("/blog");
    expect(withBase("/", "")).toBe("/");
  });

  test("does not double a prefix that is already there", () => {
    expect(withBase("/preview/pr-7/blog", "/preview/pr-7")).toBe(
      "/preview/pr-7/blog",
    );
  });

  test("leaves external and non-path URLs alone", () => {
    expect(withBase("https://example.com/x", "/preview/pr-7")).toBe(
      "https://example.com/x",
    );
    expect(withBase("//cdn.example.com/x", "/preview/pr-7")).toBe(
      "//cdn.example.com/x",
    );
    expect(withBase("#anchor", "/preview/pr-7")).toBe("#anchor");
    expect(withBase("mailto:a@b.c", "/preview/pr-7")).toBe("mailto:a@b.c");
    expect(withBase("blog/x", "/preview/pr-7")).toBe("blog/x");
  });

  test("preserves query and fragment", () => {
    expect(withBase("/blog?page=2#sec", "/preview/pr-7")).toBe(
      "/preview/pr-7/blog?page=2#sec",
    );
  });
});

describe("stripBase", () => {
  test("removes the preview prefix from a pathname", () => {
    expect(stripBase("/preview/pr-7/en/blog/a", "/preview/pr-7")).toBe(
      "/en/blog/a",
    );
    expect(stripBase("/preview/pr-7", "/preview/pr-7")).toBe("");
    expect(stripBase("/preview/pr-7/", "/preview/pr-7")).toBe("/");
  });

  test("keeps production pathnames as they are", () => {
    expect(stripBase("/blog/a", "")).toBe("/blog/a");
  });

  test("does not strip a prefix that only looks like the base", () => {
    expect(stripBase("/preview/pr-77/blog", "/preview/pr-7")).toBe(
      "/preview/pr-77/blog",
    );
  });
});

describe("isPreviewBuild", () => {
  test("is false for a production base and true for a preview base", () => {
    expect(isPreviewBuild("")).toBe(false);
    expect(isPreviewBuild("/preview/pr-7")).toBe(true);
  });
});
