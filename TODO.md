# TODO

## Images (generated with Gemini)

The chosen theme will ship demo images; they have to be replaced with our own.
Exchange folder on Google Drive, shared between the owner and the assistants:
the folder `nontech-blog-obrazki` in the owner's Google Drive (the link is in the owner's notes, not in this public repo).

- [ ] Decide what the images show (brand mood, people or no people, colours) before writing any prompt.
- [ ] Write the Gemini prompts. **Not yet**: the owner asked to postpone them.
- [ ] Generate, drop the originals into the Drive folder, then convert to WebP with explicit dimensions and
      put them in `public/images/` (the theme expects optimised WebP; hero is prioritised, the rest lazy).
- [ ] Replace the demo copy and data and the language config (PL default, EN).

## Comments (Disqus)

- [ ] Create a Disqus site for this blog and note its shortname in the config (not in git history of secrets: it is public).
- [ ] Decide: free plan with ads and a consent banner, or Plus without ads.
- [ ] One typed `Comments` component, production only, thread id = translation key.

## Other

- [x] Authors: single author, `/authors` is a noindex redirect stub to `/about` in both languages (task 2111).
- [ ] Real content for both languages: homepage, about, privacy policy (RODO), first real posts; both versions of each. The author photo and short bio now appear on `/about` but are still placeholder text.
- [ ] Brand: logo and favicon (still Astroplate's `favicon.png`, og-image); the second accent (terracotta `#b4532f`, dark `#e08a68`) has no slot in `theme.json`.
- [x] Remove what we do not use: Swiper, Google Tag Manager, the Astroplate navigation button, the unused Testimonial and CallToAction sections and the placeholder Disqus shortname (task 2112). The duplicate `/pl/` copy stays: the theme emits it under a non-root base.
- [ ] Check the Polish UI strings of the theme that are not in `src/i18n` (dates, search, form) in the browser. The sidebar, taxonomy pages, breadcrumbs, 404 title and theme switcher were moved into `src/i18n` in task 2112.
- [ ] `src/lib/breath.ts` (+ tests) waits for a widget; reuse it in the new theme or drop it.
- [ ] DNS: `droga.ww86.eu CNAME kastoestoramadus.github.io` at the registrar, then check the Pages certificate and `https_enforced`.
- [ ] PR previews: the theme ignores `base_path` (menu links and images start at `/`), so `/preview/pr-N/` cannot work until that is patched.
- [ ] Translate the interface strings of the theme (navigation, buttons, 404).
