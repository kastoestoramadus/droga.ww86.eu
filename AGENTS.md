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
node scripts/test-post-links.mjs # after build: share URLs and translated post destinations

# exact PR-preview build (same content under /preview/pr-7/; dist stays at dist/ root,
# publish-pages copies it into preview/pr-<N>/ on gh-pages):
SITE_BASE=/preview/pr-7 pnpm build
node scripts/test-preview-build.mjs dist /preview/pr-7 # every internal URL inside the prefix,
                   # noindex,nofollow on every page incl. 404, no sitemap/llms.txt, production share/og URLs
```

## Conventions

- **Content and UI text are Polish**, code, comments, commit messages and this file are English.
- Tests come before the implementation, in their own commits. Every pure function in `src/lib` gets a test.
- `astro check` must report 0 errors. A wrong frontmatter field fails the build by design; keep it that way.
- Match the surrounding code's comment density; comments never restate the obvious.

## Editorial workflow

- Keep each post in two linked, discoverable layers: a source base containing the author's facts,
  context, observations, significant wording, sources, uncertainties and deferred ideas; and a short,
  polished publication version derived from that base. Keep both easy to find for future revisions.
- Store public source bases and original photographs under `editorial/<translationKey>/`, outside
  Astro content collections and `public/`; link the source base and both publication files. Optimized
  website images belong in `public/images/<translationKey>/`.
- New facts and substantive corrections update the source base first, then the publication version.
  Editorial cuts must not remove context from the source base.
- Keep the publication opening brief and emphasize the author's completed actions and documented results.
  Put longer instructions, chronology and supporting research in optional, initially closed `details`
  sections when they would otherwise overwhelm the reader; preserve the full substance in the source base.
- Do not attribute decisions, experiences or conclusions to the author without their confirmation.
  Distinguish observations and hypotheses from verified facts.
- These editorial layers are separate from the required Polish and English translations of each post.
  Keep private notes and information about private projects out of this public repository; link the
  layers only through references safe for public disclosure, without exposing private locations.

## Gotchas

- Post language switching resolves `translationKey` to each language's slug in the header; never
  translate a post URL by prefix alone. Share URLs use the rendered page path, not a content ID.

- Frontmatter is YAML: a value containing `: ` must be quoted, or the build dies with "Nested mappings are
  not allowed".
- A plain `.md` post cannot embed components; widgets go into the page template
  (`src/pages/posts/[...slug].astro`) or into `.mdx` posts.
- Astro `base`/`site` must be set before publishing under a path prefix; internal links must respect it.
  A preview build sets the base through `SITE_BASE` (never by editing `config.json`): every internal
  link then goes through the base-aware helpers in `src/lib/basePath.ts` and `slugSelector`. Raw HTML
  in Markdown (full-size image links) is prefixed after the build by `scripts/prefix-build-html.mjs`,
  because Astro's `unified()` processor shape silently ignores extra rehype plugins. A preview build
  is noindex,nofollow everywhere, emits no sitemap and no llms.txt, keeps og:url/canonical/share URLs
  at their production addresses, and adds a `/pl/` copy of the Polish pages (Astro does that under a
  non-root base; its links are prefixed too).

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

## Commit and PR attribution

- A commit carries no `Co-Authored-By:` trailer for an AI. Its message body ends with one line per helper,
  `Helped by: <model-id>/<effort> by <coding assistant>`, e.g. `Helped by: haiku-5.5/m by Claude Code`.
- A PR body ends with `Generated with <model-id>/<effort> through [<tool>](<url>)`, then one `Revised by` or
  `Reviewed by` line per later pass in the same form.
- Effort is `l`, `m`, `h`, `xh` or `max`, as given to the agent. Older commits keep their wording.

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

**PR previews.** The site itself is base-aware now (see Gotchas), so a preview is one build:
`SITE_BASE=/preview/pr-7 pnpm build` and `scripts/publish-pages <pages> preview 7 dist` (the hub's
`preview` mode, including the retry on the gh-pages race). Previews are isolated, noindex copies:
`robots.txt` disallows `/preview/`, previews carry no sitemap/llms.txt, and their og:url, canonical
and share links keep the production addresses. The publish workflow that triggers a preview build
per PR is not wired into `.github/workflows/deploy.yml` yet. Patch that first.

DNS: `droga.ww86.eu CNAME kastoestoramadus.github.io`, set at the registrar (the hub's `DNS.md` has the pattern).
