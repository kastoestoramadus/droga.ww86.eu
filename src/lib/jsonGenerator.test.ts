import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";

// scripts/jsonGenerator.js writes the search index that the search modal bundles into public JS, so an
// unpublished post must not reach it: the same rule as the pages, tags and sitemap (publication.ts).
const script = new URL("../../scripts/jsonGenerator.js", import.meta.url).pathname;
const root = mkdtempSync(join(tmpdir(), "droga-json-"));

function post(dir: string, name: string, title: string, frontmatter: string) {
  const folder = join(root, "src/content/blog", dir);
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, `${name}.md`), `---\ntitle: "${title}"\n${frontmatter}\n---\nbody\n`);
}

afterAll(() => rmSync(root, { recursive: true, force: true }));

test("the search index holds published posts only", () => {
  for (const dir of ["polski", "english"]) {
    post(dir, "past", "Past", "date: 2020-01-01\ndraft: false");
    post(dir, "draft", "Draft", "date: 2020-01-01\ndraft: true");
    post(dir, "future", "Future", "date: 2099-01-01\ndraft: false");
  }
  execFileSync(process.execPath, [script], { cwd: root });
  const posts = JSON.parse(readFileSync(join(root, ".json/posts.json"), "utf8"));
  expect(posts.map((p: { frontmatter: { title: string } }) => p.frontmatter.title)).toEqual([
    "Past",
    "Past",
  ]);
});
