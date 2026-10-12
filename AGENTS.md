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
pnpm install
pnpm dev           # live preview with hot reload, http://localhost:4321 (also regenerates theme and json files)
pnpm build         # theme generator + json generator + astro build + llms.txt into dist/
pnpm preview       # serve dist/
pnpm check         # generates .json/search.json (the search modal imports it), then types of .astro/.ts/.tsx and of
                   # content frontmatter; run before every commit
pnpm test          # vitest, unit tests of src/lib
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

**Astroplate, branch `multilingual`** (https://github.com/zeon-studio/astroplate, MIT), imported on 2026-10-12 from
upstream commit `469ca9f348121cd3cdcc58838007fc56ba28bc34` (Astro 7, React 19, Tailwind 4, TypeScript, pnpm).
The code is ours from then on; compare with upstream when wanting its fixes. Left out on purpose: its agent files,
CI and hosting config (Cloudflare, Netlify, Docker), `.sitepins`. Yoga Fitness was tried and dropped (no i18n).

How it is laid out: languages in `src/config/language.json` (**Polish, the default and served at `/`, and
English at `/en/`**; `default_language` in `src/config/config.json`), UI strings in `src/i18n/<code>.json`, menus in
`src/config/menu.<code>.json`, content in `src/content/<collection>/<contentDir>/` (`polski`, `english`).
The build also writes a copy of the Polish site under `/pl/`.

**The versions of a post are paired by `translationKey`** (frontmatter, same value in every language; file names
differ so that Polish URLs stay Polish). `src/lib/translations.ts` finds posts without a key, a key used twice in one
language and a key missing in a language; `pnpm test` fails on any of them, and also when a language lacks its
dictionary or menu, or when a dictionary has other keys than the English one. The key is optional in the zod schema
only because `-index.md` shares the blog collection. Still shipped and unused: Google Tag Manager, Swiper,
`remove-multilang`/`remove-darkmode` scripts, the logo and texts of Astroplate in `config.json`.

Disqus is **disabled** in `src/config/config.json` (`disqus.enable: false`): the theme's shortname belongs to its
authors. Enable it only with our own shortname.

## Comments

**Disqus**, same account as the tech blog but a new site (own shortname, own moderation). Decided 2026-10-12:
no server to run, readers need no GitHub account. Known costs: the free plan shows ads and sets tracking cookies
(consent banner for Polish readers); the Plus plan (about 11 USD/month, check the price) removes the ads.
Rules, as on the tech blog: load Disqus only in the production build, never in PR previews (thread ids come from
the page URL and previews would create junk threads); one thread per post, keyed by the shared translation key
so the Polish and English versions share it; wrap it in one typed component so replacing it (Giscus, Remark42)
is a one-file change. Astroplate already depends on `disqus-react`.

## Publishing

Name **Droga**, served at https://droga.ww86.eu (a subdomain of the hub's domain, like the tech blog's `blog`).
`public/CNAME` carries the domain into the build.

```plaintext
this repo, branch master
  └─ .github/workflows/deploy.yml
       job build    (read-only token) pnpm check, pnpm test, pnpm build, scripts/test-publish-pages → artifact `site` (master)
       job publish  (master only, contents: write)   scripts/publish-pages site → root of gh-pages
            → branch gh-pages: built site only, plus `.nojekyll` and `CNAME`
               → GitHub Pages, "deploy from a branch" (gh-pages, /), custom domain droga.ww86.eu
```

The same machinery as the hub's and the tech blog's: `scripts/publish-pages` and its test are copied from the hub.
Only `GITHUB_TOKEN`, never `pull_request_target`; `contents: write` on the job `publish` only. `gh-pages` is written by
the workflow only, never by hand, and `publish-pages` refuses a site without `CNAME`.

**No PR previews yet.** The hub's `preview` mode of `publish-pages` is unused: Astroplate ignores `base_path` (menu
links and images start at `/`), so a site under `/preview/pr-N/` would link to production. Patch that first.

DNS: `droga.ww86.eu CNAME kastoestoramadus.github.io`, set at the registrar (the hub's `DNS.md` has the pattern).
