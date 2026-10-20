import config from "@/config/config.json";
import languages from "@/config/language.json";
import { SITE_BASE, stripBase, withBase } from "@/lib/basePath";
import React from "react";

const LanguageSwitcher = ({
  lang,
  pathname,
  translationPaths = {},
}: {
  lang: string;
  pathname: string;
  translationPaths?: Record<string, string>;
}) => {
  const { default_language, default_language_in_subdir } = config.settings;

  // Function to remove trailing slash if necessary
  const removeTrailingSlash = (path: string) => {
    if (!config.site.trailing_slash) {
      return path.replace(/\/$/, "");
    }
    return path;
  };

  // Sort languages by weight and filter out disabled languages
  const sortedLanguages = languages
    .filter(
      (language) =>
        !(config.settings.disable_languages as string[]).includes(language.languageCode),
    )
    .sort((a, b) => a.weight - b.weight);

  return (
    <div className={`mr-5 ${sortedLanguages.length > 1 ? "block" : "hidden"}`}>
      <select
        className="border border-dark text-text-dark bg-transparent dark:border-darkmode-primary dark:text-white py-1 rounded-sm cursor-pointer focus:ring-0 focus:border-dark dark:focus:border-darkmode-primary"
        onChange={(e) => {
          const selectedLang = e.target.value;
          if (translationPaths[selectedLang]) {
            window.location.href = translationPaths[selectedLang];
            return;
          }
          // Work on the pathname below the base (a preview build serves the site
          // under /preview/pr-<N>/), then put the base back so the switch stays
          // inside the same preview.
          const pathBelowBase = removeTrailingSlash(
            stripBase(pathname, SITE_BASE).replace(`/${lang}`, ""),
          );
          let newPath;
          if (selectedLang === default_language) {
            // stripping the language segment can leave "" (a bare /en root); the
            // target is then the site root, not an empty relative URL
            newPath = default_language_in_subdir
              ? `/${default_language}${pathBelowBase}`
              : pathBelowBase || "/";
          } else {
            newPath = `/${selectedLang}${pathBelowBase}`;
          }

          window.location.href = withBase(newPath, SITE_BASE);
        }}
        value={lang}
      >
        {sortedLanguages.map((language) => (
          <option
            className="dark:text-text-dark"
            key={language.languageCode}
            data-path={translationPaths[language.languageCode]}
            value={language.languageCode}
          >
            {language.languageName}
          </option>
        ))}
      </select>
    </div>
  );
};

export default LanguageSwitcher;
