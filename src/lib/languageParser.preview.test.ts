import { expect, test, vi } from "vitest";

// The preview contract: built under a base prefix (gh-pages preview/pr-<N>/), every
// internal link must stay inside that prefix and language detection must still work.
// These tests run against the current helpers first; before the fix they are red,
// because menu links and slugs are root-absolute and the language is read from the
// first path segment (which is "preview" under a prefix).

const previewBase = "/preview/pr-7";

async function loadHelpers() {
  vi.resetModules();
  return import("./utils/languageParser");
}

test("slugSelector keeps navigation inside the preview prefix", async () => {
  vi.stubEnv("BASE_URL", `${previewBase}/`);
  const { slugSelector } = await loadHelpers();
  expect(slugSelector("/blog", "pl")).toBe(`${previewBase}/blog`);
  expect(slugSelector("/", "pl")).toBe(`${previewBase}/`);
  expect(slugSelector("/", "en")).toBe(`${previewBase}/en`);
  expect(slugSelector("/blog/x", "en")).toBe(`${previewBase}/en/blog/x`);
  vi.unstubAllEnvs();
});

test("slugSelector keeps production URLs byte-identical without a prefix", async () => {
  vi.stubEnv("BASE_URL", "/");
  const { slugSelector } = await loadHelpers();
  expect(slugSelector("/blog", "pl")).toBe("/blog");
  expect(slugSelector("/", "pl")).toBe("/");
  expect(slugSelector("/", "en")).toBe("/en");
  expect(slugSelector("/blog/x", "en")).toBe("/en/blog/x");
  vi.unstubAllEnvs();
});

test("getLangFromUrl detects the language below the preview prefix", async () => {
  vi.stubEnv("BASE_URL", `${previewBase}/`);
  const { getLangFromUrl } = await loadHelpers();
  expect(
    getLangFromUrl(new URL(`https://droga.ww86.eu${previewBase}/en/blog/a`)),
  ).toBe("en");
  expect(
    getLangFromUrl(new URL(`https://droga.ww86.eu${previewBase}/blog/a`)),
  ).toBe("pl");
  vi.unstubAllEnvs();
});

test("getLangFromUrl still detects the language in production", async () => {
  vi.stubEnv("BASE_URL", "/");
  const { getLangFromUrl } = await loadHelpers();
  expect(getLangFromUrl(new URL("https://droga.ww86.eu/en/blog/a"))).toBe("en");
  expect(getLangFromUrl(new URL("https://droga.ww86.eu/blog/a"))).toBe("pl");
  vi.unstubAllEnvs();
});
