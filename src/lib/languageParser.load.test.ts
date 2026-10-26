import { afterEach, expect, test, vi } from "vitest";

// Importing languageParser must not start background imports of the menus and
// dictionaries: a fire-and-forget import that is still pending when a test file
// ends makes vitest fail the whole run with EnvironmentTeardownError, depending
// on how busy the workers are. They are loaded only by getTranslations().

afterEach(() => {
  for (const code of ["pl", "en"]) {
    vi.doUnmock(`../i18n/${code}.json`);
    vi.doUnmock(`../config/menu.${code}.json`);
  }
});

test("importing languageParser loads no dictionary or menu", async () => {
  const loaded: string[] = [];
  vi.resetModules();
  for (const code of ["pl", "en"]) {
    vi.doMock(`../i18n/${code}.json`, () => {
      loaded.push(`i18n/${code}`);
      return { default: {} };
    });
    vi.doMock(`../config/menu.${code}.json`, () => {
      loaded.push(`menu.${code}`);
      return { default: {} };
    });
  }
  await import("./utils/languageParser");
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(loaded).toEqual([]);
});
