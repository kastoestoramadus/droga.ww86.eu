import { unified } from "@astrojs/markdown-remark";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import AutoImport from "astro-auto-import";
import { defineConfig, fontProviders } from "astro/config";
import remarkCollapse from "remark-collapse";
import remarkToc from "remark-toc";
import sharp from "sharp";
import config from "./src/config/config.json";
import languagesJSON from "./src/config/language.json";
import theme from "./src/config/theme.json";

const { default_language } = config.settings;

const supportedLang = [...languagesJSON.map((lang) => lang.languageCode)];
const disabledLanguages = config.settings.disable_languages;

// Filter out disabled languages from supportedLang
const filteredSupportedLang = supportedLang.filter(
  (lang) => !disabledLanguages.includes(lang),
);

// Helper to parse font string format: "FontName:wght@400;500;600;700"
function parseFontString(fontStr) {
  const [name, weightPart] = fontStr.split(":");
  let weights = [400]; // default weight

  if (weightPart) {
    // Extract weights from wght@400;500;600 format
    const weightMatch = weightPart.match(/wght@?([\d;]+)/);
    if (weightMatch) {
      weights = weightMatch[1].split(";").map((w) => parseInt(w, 10));
    }
  }

  // remove + from font name and add space
  const cleanName = name.replace(/\+/g, " ");
  return { name: cleanName, weights };
}

// Build fonts configuration from theme.json
const fontsConfig = Object.entries(theme.fonts.font_family)
  .filter(([key]) => !key.includes("_type")) // Filter out type entries
  .map(([key, fontStr]) => {
    const { name, weights } = parseFontString(fontStr);
    const typeKey = `${key}_type`;
    const fallback = theme.fonts.font_family[typeKey] || "sans-serif";

    return {
      name,
      cssVariable: `--font-${key}`,
      provider: fontProviders.google(),
      weights,
      // Polish needs latin-ext (ą ć ę ł ń ś ź ż); Astro downloads only latin by default
      subsets: ["latin", "latin-ext"],
      display: "swap",
      fallbacks: [fallback],
    };
  });

// PR previews build the same site under /preview/pr-<N>/ on the existing gh-pages
// branch: SITE_BASE overrides the base for one build, config.site.base_path stays
// the production root. `site` keeps the production URL so meta and sitemap never
// learn preview addresses.
const base = process.env.SITE_BASE || config.site.base_path || "/";
const isPreviewBuild = base !== "/" && base !== "";

// https://astro.build/config
export default defineConfig({
  site: config.site.base_url ? config.site.base_url : "http://examplesite.com",
  base,
  trailingSlash: config.site.trailing_slash ? "always" : "ignore",
  vite: { plugins: [tailwindcss()] },
  fonts: fontsConfig,
  i18n: { locales: filteredSupportedLang, defaultLocale: default_language },
  image: { service: sharp() },
  integrations: [
    react(),
    // the sitemap lists production pages only; a preview build is noindex and
    // must not publish its prefixed URLs as discoverable content
    ...(isPreviewBuild ? [] : [sitemap()]),
    AutoImport({
      imports: [
        "@/shortcodes/Button",
        "@/shortcodes/Accordion",
        "@/shortcodes/Notice",
        "@/shortcodes/Video",
        "@/shortcodes/Youtube",
        "@/shortcodes/Tabs",
        "@/shortcodes/Tab",
      ],
    }),
    mdx(),
  ],
  markdown: {
    processor: unified({
      remarkPlugins: [
        remarkToc,
        [remarkCollapse, { test: "Table of contents" }],
      ],
    }),
    shikiConfig: { theme: "one-dark-pro", wrap: true },
  },
});
