import { expect, test } from "vitest";
import {
  auditDrogaEditorial,
  parseSourceBasePointer,
  scanBriefForUnconfirmedFields,
  type AuditInput,
  type EditorialBase,
  type Finding,
  type PostVersion,
} from "./drogaEditorialAudit.ts";

const post = (language: string, file: string, translationKey: string, sourceBase?: string): PostVersion => ({
  language,
  file,
  path: `src/content/blog/${language === "pl" ? "polski" : "english"}/${file}`,
  translationKey,
  sourceBase,
  pointerKey: undefined,
});

const base = (key: string, linkedPosts: readonly string[], hasBrief = true): EditorialBase => ({
  key,
  dir: `editorial/${key}`,
  hasSource: true,
  hasBrief,
  linkedPosts,
});

// A closed world: everything the fixtures reference exists unless a test says otherwise.
const fileTree = (paths: readonly string[]) => {
  const existing = new Set(paths);
  return (path: string): boolean => existing.has(path);
};

const complete = (): AuditInput => ({
  posts: [
    post("pl", "a.md", "topic", "editorial/topic/source.md"),
    post("en", "a.md", "topic", "editorial/topic/source.md"),
  ],
  languages: ["pl", "en"],
  bases: [base("topic", ["src/content/blog/polski/a.md", "src/content/blog/english/a.md"])],
  briefs: [{ key: "topic", path: "editorial/topic/brief.md", unconfirmed: [] }],
  exists: fileTree([
    "editorial/topic/source.md",
    "editorial/topic/brief.md",
    "src/content/blog/polski/a.md",
    "src/content/blog/english/a.md",
  ]),
});

const withInput = (overrides: Partial<AuditInput>): AuditInput => ({ ...complete(), ...overrides });

const ofSeverity = (findings: readonly Finding[], severity: Finding["severity"]) =>
  findings.filter((f) => f.severity === severity);

test("a complete editorial set has no findings", () => {
  expect(auditDrogaEditorial(complete())).toEqual([]);
});

test("a dangling source pointer is an error", () => {
  const findings = auditDrogaEditorial(
    withInput({
      exists: fileTree([
        "editorial/topic/brief.md",
        "src/content/blog/polski/a.md",
        "src/content/blog/english/a.md",
      ]),
    }),
  );
  expect(ofSeverity(findings, "error")).toEqual([
    {
      severity: "error",
      category: "source-base",
      subject: "src/content/blog/english/a.md",
      message: "dangling source pointer: editorial/topic/source.md does not exist",
    },
    {
      severity: "error",
      category: "source-base",
      subject: "src/content/blog/polski/a.md",
      message: "dangling source pointer: editorial/topic/source.md does not exist",
    },
  ]);
});

test("a key missing its partner language is an error and the base link gap is missing", () => {
  const findings = auditDrogaEditorial(
    withInput({
      posts: [post("pl", "a.md", "topic", "editorial/topic/source.md")],
      bases: [base("topic", ["src/content/blog/polski/a.md"])],
    }),
  );
  expect(
    findings.some(
      (f) =>
        f.severity === "error" &&
        f.category === "translation-key" &&
        f.message.includes('"topic" has no version in "en"'),
    ),
  ).toBe(true);
  expect(
    findings.some((f) => f.severity === "missing" && f.message.includes("does not link both language versions")),
  ).toBe(true);
});

test("a key used twice in one language is reported as ambiguous", () => {
  const findings = auditDrogaEditorial(
    withInput({
      posts: [
        post("pl", "a.md", "topic", "editorial/topic/source.md"),
        post("pl", "b.md", "topic", "editorial/topic/source.md"),
        post("en", "a.md", "topic", "editorial/topic/source.md"),
      ],
    }),
  );
  expect(
    findings.some((f) => f.severity === "error" && f.message.includes('"topic" is used twice in "pl"')),
  ).toBe(true);
});

test("a post key that disagrees with the editorial dir name is an identity error", () => {
  const findings = auditDrogaEditorial(
    withInput({
      posts: [
        post("pl", "a.md", "other-topic", "editorial/topic/source.md"),
        post("en", "a.md", "other-topic", "editorial/topic/source.md"),
      ],
    }),
  );
  expect(
    findings.filter((f) => f.category === "source-base" && f.message.includes("does not match editorial base")),
  ).toHaveLength(2);
});

test("legacy or demo content without an editorial layer is not-applicable, never missing", () => {
  const findings = auditDrogaEditorial(
    withInput({
      posts: [post("pl", "demo.md", "first-post"), post("en", "demo.md", "first-post")],
      bases: [],
      briefs: [],
      exists: fileTree(["src/content/blog/polski/demo.md", "src/content/blog/english/demo.md"]),
    }),
  );
  expect(ofSeverity(findings, "missing")).toEqual([]);
  expect(ofSeverity(findings, "not-applicable")).toEqual([
    {
      severity: "not-applicable",
      category: "source-base",
      subject: "src/content/blog/english/demo.md",
      message: 'no editorial layer for "first-post" (legacy/demo content): editorial checks not applicable',
    },
    {
      severity: "not-applicable",
      category: "source-base",
      subject: "src/content/blog/polski/demo.md",
      message: 'no editorial layer for "first-post" (legacy/demo content): editorial checks not applicable',
    },
  ]);
});

test("a real post whose base exists but that carries no pointer is missing", () => {
  const findings = auditDrogaEditorial(
    withInput({ posts: [post("pl", "a.md", "topic"), post("en", "a.md", "topic")] }),
  );
  expect(
    ofSeverity(findings, "missing").filter((f) => f.message.includes("does not link its source base")),
  ).toHaveLength(2);
});

test("a dangling publication link in a source base is an error", () => {
  const findings = auditDrogaEditorial(
    withInput({
      bases: [base("topic", ["src/content/blog/polski/a.md", "src/content/blog/english/gone.md"])],
      exists: fileTree([
        "editorial/topic/source.md",
        "editorial/topic/brief.md",
        "src/content/blog/polski/a.md",
      ]),
    }),
  );
  expect(
    findings.some(
      (f) =>
        f.severity === "error" &&
        f.category === "publication-path" &&
        f.message.includes("dangling publication link: src/content/blog/english/gone.md"),
    ),
  ).toBe(true);
});

test("a source base linking a post with a different key is an identity error", () => {
  const findings = auditDrogaEditorial(
    withInput({
      posts: [
        post("pl", "a.md", "topic", "editorial/topic/source.md"),
        post("en", "renamed.md", "something-else", "editorial/topic/source.md"),
      ],
      bases: [base("topic", ["src/content/blog/polski/a.md", "src/content/blog/english/renamed.md"])],
      exists: fileTree([
        "editorial/topic/source.md",
        "editorial/topic/brief.md",
        "src/content/blog/polski/a.md",
        "src/content/blog/english/renamed.md",
      ]),
    }),
  );
  expect(
    findings.some(
      (f) =>
        f.severity === "error" &&
        f.category === "publication-path" &&
        f.message.includes('linked post uses translationKey "something-else", base is "topic"'),
    ),
  ).toBe(true);
});

test("an editorial base no post refers to is missing", () => {
  const findings = auditDrogaEditorial(
    withInput({
      bases: [
        base("topic", ["src/content/blog/polski/a.md", "src/content/blog/english/a.md"]),
        base("orphan", [], false),
      ],
      exists: fileTree([
        "editorial/topic/source.md",
        "editorial/topic/brief.md",
        "editorial/orphan/source.md",
        "src/content/blog/polski/a.md",
        "src/content/blog/english/a.md",
      ]),
    }),
  );
  expect(
    ofSeverity(findings, "missing").some((f) => f.message.includes('unreferenced editorial base "orphan"')),
  ).toBe(true);
});

test("a base without a brief is missing owner input, not an error", () => {
  const findings = auditDrogaEditorial(
    withInput({
      bases: [base("topic", ["src/content/blog/polski/a.md", "src/content/blog/english/a.md"], false)],
      briefs: [],
      exists: fileTree([
        "editorial/topic/source.md",
        "src/content/blog/polski/a.md",
        "src/content/blog/english/a.md",
      ]),
    }),
  );
  expect(ofSeverity(findings, "error")).toEqual([]);
  expect(ofSeverity(findings, "missing").some((f) => f.message.includes("no brief.md"))).toBe(true);
});

test("unconfirmed brief fields are reported as missing owner input", () => {
  const findings = auditDrogaEditorial(
    withInput({
      briefs: [
        {
          key: "topic",
          path: "editorial/topic/brief.md",
          unconfirmed: [{ field: "Odbiorcy", markers: ["NIEPOTWIERDZONE"] }],
        },
      ],
    }),
  );
  expect(ofSeverity(findings, "error")).toEqual([]);
  expect(
    ofSeverity(findings, "missing").some(
      (f) => f.category === "brief" && f.message.includes("Odbiorcy") && f.message.includes("awaiting the author"),
    ),
  ).toBe(true);
});

test("a pointer comment key that disagrees with the frontmatter key is an identity error", () => {
  const findings = auditDrogaEditorial(
    withInput({
      posts: [
        { ...post("pl", "a.md", "topic", "editorial/topic/source.md"), pointerKey: "other" },
        post("en", "a.md", "topic", "editorial/topic/source.md"),
      ],
    }),
  );
  expect(
    findings.some(
      (f) =>
        f.severity === "error" &&
        f.category === "translation-key" &&
        f.message.includes('pointer comment says translationKey "other"'),
    ),
  ).toBe(true);
});

test("parseSourceBasePointer reads both label variants and the translationKey echo", () => {
  expect(
    parseSourceBasePointer(
      "<!-- Source base: editorial/trees-with-ai/source.md; translationKey: trees-with-ai. -->",
    ),
  ).toEqual({ sourceBase: "editorial/trees-with-ai/source.md", translationKey: "trees-with-ai" });
  expect(
    parseSourceBasePointer(
      "<!-- Baza merytoryczna: editorial/pellet-sifting/source.md; translationKey: pellet-sifting. -->",
    ),
  ).toEqual({ sourceBase: "editorial/pellet-sifting/source.md", translationKey: "pellet-sifting" });
  expect(parseSourceBasePointer("plain body without a pointer")).toBeUndefined();
});

test("scanBriefForUnconfirmedFields finds unconfirmed markers with their bullet labels", () => {
  const text = [
    "# Brief",
    "- **Odbiorcy** (tylko autor): **NIEPOTWIERDZONE** — nie zapisano.",
    "- **Cel** (tylko autor): potwierdzony w bazie.",
    "- **Niezatwierdzone wprost:** głos: [puste — wymaga decyzji autora]; wybory: [puste — wymaga decyzji autora].",
  ].join("\n");
  expect(scanBriefForUnconfirmedFields(text)).toEqual([
    { field: "Odbiorcy", markers: ["NIEPOTWIERDZONE"] },
    {
      field: "Niezatwierdzone wprost",
      markers: ["puste — wymaga decyzji autora", "puste — wymaga decyzji autora"],
    },
  ]);
});
