# AGENTS.md

Guide for AI coding agents working in this repository. **Keep it up to date**: whenever you change the
build, deployment, dependencies, conventions or discover a new gotcha, update this file in the same change.

## What this is

A non-technical blog (coaching, social activism, personal writing) in Polish. Static output, no server,
no database. Chosen over a hosted platform because the owner wants a static site with small JS extras and
full ownership of the content.

**Public repository, public text.** Treat every line here, in commits and in TODO.md as public. The owner is
openly an IT engineer, so linking this blog with https://ww86.eu and the tech blog is fine. Do not mention,
link or hint at the owner's other private projects, and do not add analytics, comment systems or social handles
that belong to them.

## Stack

- Astro (static output) with a theme from https://astro.build/themes/ (copied into this repo, so the code is
  ours; see "Theme" below). **Every post exists in Polish and English**: Astro i18n routing, a shared
  translation key in the typed content schema, a typed UI dictionary. Content in Markdown under `src/content/`, validated by a zod schema
  in `src/content.config.ts`.
- **TypeScript everywhere, as strict as the theme allows**: `astro/tsconfigs/strict`, typed content
  schemas, typed props, pure logic in `src/lib/*.ts` with vitest tests, widgets only wire it to the DOM.
- Interactive widgets are React islands (`client:visible`), typed in `.tsx`, logic in `src/lib`. Measured on
  the removed theme: react-dom ~65 KB gzip, only on pages that have an island. Small stateless widgets can
  stay a plain `<script>` in `.astro`.
- Scala.js is for a widget big enough to justify ~150 KB of runtime (Laminar),
  built separately and copied into `public/js/`; it is not previewed live. Do not reach for it for small things.

## Commands

```bash
npm install
npm run dev        # live preview with hot reload, http://localhost:4321
npm run build      # static site into dist/
npm run preview    # serve dist/ as it will be published
npx astro check    # types of .astro/.ts files and of the content frontmatter; run before every commit
npx vitest run     # unit tests of src/lib
```

## Conventions

- **Content and UI text are Polish**, code, comments, commit messages and this file are English.
- Tests come before the implementation, in their own commits. Every pure function in `src/lib` gets a test.
- `astro check` must report 0 errors. A wrong frontmatter field fails the build by design; keep it that way.
- Match the surrounding code's comment density; comments never restate the obvious.

## Gotchas

- Frontmatter is YAML: a value containing `: ` must be quoted, or the build dies with "Nested mappings are
  not allowed".
- A plain `.md` post cannot embed components; widgets go into the page template
  (`src/pages/posts/[...slug].astro`) or into `.mdx` posts.
- Astro `base`/`site` must be set before publishing under a path prefix; internal links must respect it.

## Theme

Not chosen. Yoga Fitness (Scintillaweb, MIT) was imported on 2026-10-12 and removed the same day: no i18n, and
every post has to exist in two languages (PL and EN). Candidates: Astroplate `multilingual` branch
(zeon-studio, MIT, Astro 7, React 19, Tailwind 4) or astro-i18n-starter-pro (naodeng). Record the decision,
date and upstream commit here when made.

## Comments

**Disqus**, same account as the tech blog but a new site (own shortname, own moderation). Decided 2026-10-12:
no server to run, readers need no GitHub account. Known costs: the free plan shows ads and sets tracking cookies
(consent banner for Polish readers); the Plus plan (about 11 USD/month, check the price) removes the ads.
Rules, as on the tech blog: load Disqus only in the production build, never in PR previews (thread ids come from
the page URL and previews would create junk threads); one thread per post, keyed by the shared translation key
so the Polish and English versions share it; wrap it in one typed component so replacing it (Giscus, Remark42)
is a one-file change. Astroplate already depends on `disqus-react`.

## Publishing

Not set up yet. Intended: GitHub Pages from a branch, the same `publish-pages` machinery as ww86.eu, a
separate domain or a subdomain of the hub (decision pending).
