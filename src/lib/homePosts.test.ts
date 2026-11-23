import { describe, expect, it } from "vitest";
import { selectHomePosts } from "./homePosts";

interface TestPost {
  id: string;
  data: { date?: Date; draft?: boolean };
}

const post = (id: string, date: string, draft = false): TestPost => ({
  id,
  data: { date: new Date(date), draft },
});

describe("selectHomePosts", () => {
  const now = new Date("2026-11-19T12:00:00Z");

  it("selects the newest published posts, newest first, and reports the overflow", () => {
    const posts = [
      post("old", "2026-01-01"),
      post("newest", "2026-11-01"),
      post("draft", "2026-11-18", true),
      post("future", "2026-12-01"),
      post("middle", "2026-06-01"),
    ];
    const result = selectHomePosts(posts, 2, now);
    expect(result.posts.map((p) => p.id)).toEqual(["newest", "middle"]);
    expect(result.showAll).toBe(true);
  });

  it("does not report overflow when the published posts fit", () => {
    const result = selectHomePosts(
      [post("b", "2026-02-01"), post("a", "2026-01-01")],
      2,
      now,
    );
    expect(result.posts.map((p) => p.id)).toEqual(["b", "a"]);
    expect(result.showAll).toBe(false);
  });

  it("does not mutate the input array", () => {
    const posts = [post("b", "2026-02-01"), post("a", "2026-01-01")];
    const before = posts.map((p) => p.id);
    selectHomePosts(posts, 1, now);
    expect(posts.map((p) => p.id)).toEqual(before);
  });

  it("keeps posts without a date and honours explicit draft/future flags", () => {
    const undated: TestPost = { id: "undated", data: {} };
    const posts = [undated, post("draft", "2026-11-18", true)];
    expect(selectHomePosts(posts, 10, now).posts.map((p) => p.id)).toEqual([
      "undated",
    ]);
    expect(
      selectHomePosts(posts, 10, now, { drafts: true, future: true }).posts,
    ).toHaveLength(2);
  });
});
