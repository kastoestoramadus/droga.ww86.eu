import { translationProblems } from "./translations.ts";

/**
 * Editorial traceability audit for the two-layer workflow (AGENTS.md "Editorial workflow"):
 * every post points at its source base under editorial/<translationKey>/, the base links both
 * publication versions, and brief fields awaiting the author are visible as such.
 *
 * This is a path/keyword checker over public editorial inputs. It proves nothing about factual
 * accuracy, author approval or style; "unconfirmed" below means a marker was found, nothing more.
 * Pure functions only: the caller supplies an exists() predicate, so tests run on closed worlds.
 * Erasable TypeScript only (no enums/namespaces): scripts/droga-editorial-audit.mjs imports this
 * file through Node's native type stripping.
 */

export type Severity = "error" | "missing" | "not-applicable";

export type Category = "translation-key" | "source-base" | "publication-path" | "brief";

export interface Finding {
  readonly severity: Severity;
  readonly category: Category;
  readonly subject: string;
  readonly message: string;
}

export interface PostVersion {
  readonly language: string;
  readonly file: string;
  /** Repo-relative path of the publication file, e.g. src/content/blog/polski/a.md. */
  readonly path: string;
  readonly translationKey: string | undefined;
  /** Repo-relative source base path from the pointer comment, when the post carries one. */
  readonly sourceBase: string | undefined;
  /** translationKey echoed inside the pointer comment, when present there. */
  readonly pointerKey: string | undefined;
}

export interface EditorialBase {
  /** Directory name under editorial/, expected to equal the posts' translationKey. */
  readonly key: string;
  readonly dir: string;
  readonly hasSource: boolean;
  readonly hasBrief: boolean;
  /** Repo-relative publication paths linked from the source base. */
  readonly linkedPosts: readonly string[];
}

export interface UnconfirmedField {
  readonly field: string;
  readonly markers: readonly string[];
}

export interface BriefReview {
  readonly key: string;
  readonly path: string;
  readonly unconfirmed: readonly UnconfirmedField[];
}

export interface AuditInput {
  readonly posts: readonly PostVersion[];
  readonly languages: readonly string[];
  readonly bases: readonly EditorialBase[];
  readonly briefs: readonly BriefReview[];
  readonly exists: (repoRelativePath: string) => boolean;
}

export interface SourceBasePointer {
  readonly sourceBase: string;
  readonly translationKey: string | undefined;
}

const POINTER_PATTERN =
  /<!--\s*(?:Source base|Baza merytoryczna):\s*(editorial\/[^>;\s]+)\s*(?:;\s*translationKey:\s*([^>;\s.]+))?/;

const BASE_SHAPE = /^editorial\/([^/]+)\/source\.md$/;

const SEVERITY_ORDER: readonly Severity[] = ["error", "missing", "not-applicable"];

/** Reads the "Source base" / "Baza merytoryczna" comment a post carries next to its opening. */
export function parseSourceBasePointer(body: string): SourceBasePointer | undefined {
  const match = POINTER_PATTERN.exec(body);
  if (!match) return undefined;
  return { sourceBase: match[1]!, translationKey: match[2] };
}

const UNCONFIRMED_MARKERS: readonly { readonly pattern: RegExp; readonly label: string }[] = [
  { pattern: /\bNIEPOTWIERDZONE\b/g, label: "NIEPOTWIERDZONE" },
  { pattern: /\[puste — wymaga decyzji autora\]/g, label: "puste — wymaga decyzji autora" },
];

/**
 * Finds brief bullets still awaiting the author: a bullet label plus every explicit
 * unconfirmed marker on its line. Keyword scan of the worksheet markers only.
 */
export function scanBriefForUnconfirmedFields(text: string): readonly UnconfirmedField[] {
  const unconfirmed: UnconfirmedField[] = [];
  for (const line of text.split("\n")) {
    const label = /^\s*-\s*\*\*([^*]+)\*\*/.exec(line);
    if (!label) continue;
    const markers: string[] = [];
    for (const { pattern, label: markerLabel } of UNCONFIRMED_MARKERS) {
      pattern.lastIndex = 0;
      while (pattern.exec(line)) markers.push(markerLabel);
    }
    if (markers.length > 0) unconfirmed.push({ field: label[1]!.trim().replace(/:$/, ""), markers });
  }
  return unconfirmed;
}

/**
 * The whole audit. Errors mean broken traceability (dangling pointer/link, key mismatch,
 * missing or duplicated language version). "missing" means owner input the workflow expects
 * but does not have yet. "not-applicable" isolates legacy/demo content with no editorial layer.
 */
export function auditDrogaEditorial(input: AuditInput): readonly Finding[] {
  const findings: Finding[] = [];
  const postsByPath = new Map(input.posts.map((post) => [post.path, post]));
  const basesByKey = new Map(input.bases.map((base) => [base.key, base]));

  for (const problem of translationProblems(
    input.posts.map((post) => ({
      language: post.language,
      file: post.file,
      translationKey: post.translationKey,
    })),
    input.languages,
  )) {
    findings.push({ severity: "error", category: "translation-key", subject: "blog posts", message: problem });
  }

  for (const post of input.posts) {
    if (
      post.pointerKey !== undefined &&
      post.translationKey !== undefined &&
      post.pointerKey !== post.translationKey
    ) {
      findings.push({
        severity: "error",
        category: "translation-key",
        subject: post.path,
        message: `pointer comment says translationKey "${post.pointerKey}", frontmatter says "${post.translationKey}"`,
      });
    }

    if (post.sourceBase === undefined) {
      const hasLayer = post.translationKey !== undefined && basesByKey.has(post.translationKey);
      if (hasLayer) {
        findings.push({
          severity: "missing",
          category: "source-base",
          subject: post.path,
          message: `post does not link its source base (expected pointer to editorial/${post.translationKey}/source.md)`,
        });
      } else {
        findings.push({
          severity: "not-applicable",
          category: "source-base",
          subject: post.path,
          message: `no editorial layer for "${post.translationKey ?? "<no key>"}" (legacy/demo content): editorial checks not applicable`,
        });
      }
      continue;
    }

    const shape = BASE_SHAPE.exec(post.sourceBase);
    if (!shape) {
      findings.push({
        severity: "error",
        category: "source-base",
        subject: post.path,
        message: `source base pointer ${post.sourceBase} does not follow editorial/<translationKey>/source.md`,
      });
    } else if (post.translationKey !== undefined && shape[1] !== post.translationKey) {
      findings.push({
        severity: "error",
        category: "source-base",
        subject: post.path,
        message: `post translationKey "${post.translationKey}" does not match editorial base "${shape[1]}"`,
      });
    }

    if (!input.exists(post.sourceBase)) {
      findings.push({
        severity: "error",
        category: "source-base",
        subject: post.path,
        message: `dangling source pointer: ${post.sourceBase} does not exist`,
      });
    }
  }

  const referenced = new Set<string>();
  for (const post of input.posts) {
    const shape = post.sourceBase === undefined ? undefined : BASE_SHAPE.exec(post.sourceBase);
    if (shape) referenced.add(shape[1]!);
    if (post.translationKey !== undefined && basesByKey.has(post.translationKey)) referenced.add(post.translationKey);
  }

  for (const base of input.bases) {
    if (!referenced.has(base.key)) {
      findings.push({
        severity: "missing",
        category: "source-base",
        subject: base.dir,
        message: `unreferenced editorial base "${base.key}": no post points at it or uses its key`,
      });
    }

    if (!base.hasSource) {
      findings.push({
        severity: "error",
        category: "publication-path",
        subject: base.dir,
        message: "editorial directory has no source.md",
      });
      continue;
    }

    for (const link of base.linkedPosts) {
      if (!input.exists(link)) {
        findings.push({
          severity: "error",
          category: "publication-path",
          subject: `${base.dir}/source.md`,
          message: `dangling publication link: ${link} does not exist`,
        });
        continue;
      }
      const linked = postsByPath.get(link);
      if (linked === undefined) {
        findings.push({
          severity: "error",
          category: "publication-path",
          subject: `${base.dir}/source.md`,
          message: `linked publication path ${link} is not one of the audited posts`,
        });
      } else if (linked.translationKey !== base.key) {
        findings.push({
          severity: "error",
          category: "publication-path",
          subject: `${base.dir}/source.md`,
          message: `linked post uses translationKey "${linked.translationKey ?? "<none>"}", base is "${base.key}"`,
        });
      }
    }

    const linkedLanguages = new Set(
      base.linkedPosts.flatMap((link) => {
        const post = postsByPath.get(link);
        return post === undefined ? [] : [post.language];
      }),
    );
    if (linkedLanguages.size < 2) {
      findings.push({
        severity: "missing",
        category: "publication-path",
        subject: `${base.dir}/source.md`,
        message: `does not link both language versions (linked: ${[...linkedLanguages].join(", ") || "none"})`,
      });
    }

    if (!base.hasBrief) {
      findings.push({
        severity: "missing",
        category: "brief",
        subject: base.dir,
        message: "no brief.md for this base (worksheet unfilled)",
      });
    }
  }

  for (const brief of input.briefs) {
    for (const field of brief.unconfirmed) {
      findings.push({
        severity: "missing",
        category: "brief",
        subject: brief.path,
        message: `${field.field}: ${field.markers.join(", ")} — awaiting the author (marker scan, not semantic verification)`,
      });
    }
  }

  return [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      a.category.localeCompare(b.category) ||
      a.subject.localeCompare(b.subject) ||
      a.message.localeCompare(b.message),
  );
}
