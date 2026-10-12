import { existsSync, readdirSync, readFileSync } from "node:fs";
import matter from "gray-matter";
import { expect, test } from "vitest";
import languages from "../config/language.json";
import { translationProblems, type PostRef } from "./translations";

const post = (language: string, file: string, translationKey?: string): PostRef => ({
  language,
  file,
  translationKey,
});

test("a complete set of pairs has no problems", () => {
  const posts = [post("pl", "a.md", "a"), post("en", "a.md", "a"), post("pl", "b.md", "b"), post("en", "b.md", "b")];
  expect(translationProblems(posts, ["pl", "en"])).toEqual([]);
});

test("a post without a version in some language is reported with key and language", () => {
  const problems = translationProblems([post("pl", "a.md", "a")], ["pl", "en"]);
  expect(problems).toEqual(['"a" has no version in "en"']);
});

test("a post without a translationKey is reported with its file", () => {
  const problems = translationProblems([post("pl", "a.md")], ["pl"]);
  expect(problems).toEqual(["pl/a.md has no translationKey"]);
});

test("two posts with one key in one language are reported", () => {
  const posts = [post("pl", "a.md", "a"), post("pl", "b.md", "a")];
  expect(translationProblems(posts, ["pl"])).toEqual(['"a" is used twice in "pl": a.md, b.md']);
});

const blogDir = "src/content/blog";

const repoPosts: PostRef[] = languages.flatMap(({ languageCode, contentDir }) =>
  readdirSync(`${blogDir}/${contentDir}`)
    .filter((file) => file.endsWith(".md") && !file.startsWith("-"))
    .map((file) =>
      post(languageCode, file, matter(readFileSync(`${blogDir}/${contentDir}/${file}`, "utf8")).data.translationKey),
    ),
);

test("every blog post of the repository has a version in every language", () => {
  expect(translationProblems(repoPosts, languages.map((l) => l.languageCode))).toEqual([]);
});

test("every language has a dictionary and a menu", () => {
  for (const { languageCode } of languages) {
    expect(existsSync(`src/i18n/${languageCode}.json`), `src/i18n/${languageCode}.json`).toBe(true);
    expect(existsSync(`src/config/menu.${languageCode}.json`), `menu.${languageCode}.json`).toBe(true);
  }
});

test("every dictionary has exactly the keys of the English one", () => {
  const keys = (code: string) => Object.keys(JSON.parse(readFileSync(`src/i18n/${code}.json`, "utf8"))).sort();
  for (const { languageCode } of languages) {
    expect(keys(languageCode), languageCode).toEqual(keys("en"));
  }
});

test("Polish is a language of the site", () => {
  expect(languages.map((l) => l.languageCode)).toContain("pl");
});
