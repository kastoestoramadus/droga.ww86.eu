import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shouldShowCategories } from "./taxonomySidebar";

interface MenuItem {
  name: string;
  url: string;
  hasChildren?: boolean;
  children?: MenuItem[];
}

interface MenuConfig {
  main: MenuItem[];
  footer: MenuItem[];
}

const readMenu = (lang: string): MenuConfig =>
  JSON.parse(
    readFileSync(new URL(`../config/menu.${lang}.json`, import.meta.url), "utf8"),
  ) as MenuConfig;

const expectedMain: Record<string, string[]> = {
  pl: ["Start", "Wpisy", "O mnie", "Kontakt"],
  en: ["Home", "Posts", "About", "Contact"],
};

describe("flat main menu", () => {
  for (const lang of ["pl", "en"]) {
    it(`${lang} has four flat items and no dropdown or authors page`, () => {
      const menu = readMenu(lang);
      expect(menu.main.map((item) => item.name)).toEqual(expectedMain[lang]);
      expect(
        menu.main.some(
          (item) => item.hasChildren === true || (item.children ?? []).length > 0,
        ),
      ).toBe(false);
      const raw = JSON.stringify(menu);
      expect(raw).not.toContain("Autorzy");
      expect(raw).not.toContain("Authors");
    });

    it(`${lang} footer links the RSS feed (prefixed at render time)`, () => {
      const menu = readMenu(lang);
      expect(menu.footer.some((item) => item.url === "/rss.xml")).toBe(true);
    });
  }
});

describe("shouldShowCategories", () => {
  it("hides the sidebar box with fewer than two categories", () => {
    expect(shouldShowCategories([])).toBe(false);
    expect(shouldShowCategories(["przyroda"])).toBe(false);
  });

  it("shows the sidebar box with two or more categories", () => {
    expect(shouldShowCategories(["przyroda", "gry"])).toBe(true);
  });
});
