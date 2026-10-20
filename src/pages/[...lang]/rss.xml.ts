import type { APIRoute } from "astro";
import config from "@/config/config.json";
import languages from "@/config/language.json";
import { getSinglePage } from "@/lib/contentParser.astro";
import { feedItems, rssXml, type FeedChannelTexts } from "@/lib/drogaFeed";
import type { SiteUrlConfig } from "@/lib/drogaSharingMetadata";

const site: SiteUrlConfig = {
  baseUrl: config.site.base_url,
  basePath: config.site.base_path,
  defaultLanguage: config.settings.default_language,
  defaultLanguageInSubdir: config.settings.default_language_in_subdir,
  trailingSlash: config.site.trailing_slash,
};

// One feed per language, at each language root: /rss.xml (Polish, the default
// language served at /) and /en/rss.xml. The /pl/ alias routes canonicalise to
// the root PL pages and deliberately get no feed of their own.
const texts: Record<string, FeedChannelTexts> = {
  pl: {
    title: `${config.site.title} — wszystkie wpisy`,
    description: config.metadata.meta_description,
  },
  en: {
    title: `${config.site.title} — all posts`,
    // English rendering of the Polish meta_description, same meaning.
    description: "Droga: notes about people, change and what we do together.",
  },
};

export const getStaticPaths = () => {
  const { default_language, default_language_in_subdir } = config.settings;
  const disabledLanguages = config.settings.disable_languages as string[];
  const codes = languages
    .map(({ languageCode }) => languageCode)
    .filter((code) => !disabledLanguages.includes(code));
  return codes.map((code) => ({
    params: {
      lang:
        code === default_language && !default_language_in_subdir
          ? undefined
          : code,
    },
    props: { language: code },
  }));
};

export const GET: APIRoute<{ language: string }> = async ({ props }) => {
  const channel = texts[props.language];
  if (!channel) {
    return new Response("No feed for this language", { status: 404 });
  }
  // getSinglePage applies the site's own draft/future filtering, so the feed
  // lists exactly the posts the pages list.
  const posts = await getSinglePage("blog", props.language);
  const items = feedItems(
    site,
    props.language,
    "blog",
    posts.map((post) => ({
      slug: post.id.split("/").pop()!,
      title: post.data.title,
      description: post.data.description,
      date: post.data.date,
    })),
  );
  const xml = rssXml({
    site,
    language: props.language,
    texts: channel,
    items,
    lastBuild: new Date(),
  });
  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
};
