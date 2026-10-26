import { describe, expect, test } from "vitest";
import { isPublished } from "./publication";

const now = new Date("2026-10-26T12:00:00Z");

describe("isPublished", () => {
  test("a plain past post is published", () => {
    expect(isPublished({ draft: false, date: new Date("2026-10-18") }, now)).toBe(true);
  });

  test("a draft is not published, even with a past date", () => {
    expect(isPublished({ draft: true, date: new Date("2026-10-18") }, now)).toBe(false);
  });

  test("a future-dated post is not published", () => {
    expect(isPublished({ draft: false, date: new Date("2099-01-01") }, now)).toBe(false);
  });

  test("a post without draft and date fields (e.g. a page) is published", () => {
    expect(isPublished({}, now)).toBe(true);
  });

  test("the build flags let drafts and future posts through for a local preview", () => {
    expect(isPublished({ draft: true }, now, { drafts: true })).toBe(true);
    expect(isPublished({ date: new Date("2099-01-01") }, now, { future: true })).toBe(true);
  });
});
