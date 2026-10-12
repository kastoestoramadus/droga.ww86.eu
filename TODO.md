# TODO

## Images (generated with Gemini)

The chosen theme will ship demo images; they have to be replaced with our own.
Exchange folder on Google Drive, shared between the owner and the assistants:
https://drive.google.com/drive/folders/1qHrTwdRpKMF6pwwqCDgLEBrmwWiO0m7n (`nontech-blog-obrazki`).

- [ ] Decide what the images show (brand mood, people or no people, colours) before writing any prompt.
- [ ] Write the Gemini prompts. **Not yet**: the owner asked to postpone them.
- [ ] Generate, drop the originals into the Drive folder, then convert to WebP with explicit dimensions and
      put them in `public/images/` (the theme expects optimised WebP; hero is prioritised, the rest lazy).
- [ ] Replace the demo copy and data and the language config (PL default, EN).

## Other

- [ ] Pick the theme (Astroplate multilingual or astro-i18n-starter-pro), import it in its own commit.
- [ ] `src/lib/breath.ts` (+ tests) waits for a widget; reuse it in the new theme or drop it.
- [ ] Publishing: domain/subdomain, `SITE_URL` and `BASE_PATH`, deploy workflow (see AGENTS.md).
- [ ] Translate the interface strings of the theme (navigation, buttons, 404).
