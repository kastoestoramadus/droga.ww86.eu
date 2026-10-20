import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readStyle = (name: string): string =>
  readFileSync(new URL(name, import.meta.url), "utf8");

describe("droga-reading.css contract", () => {
  const main = readStyle("main.css");
  const reading = readStyle("droga-reading.css");

  it("main.css imports droga-reading.css", () => {
    expect(main).toMatch(/@import "\.\/droga-reading\.css";/);
  });

  it("constrains prose measure without capping media or tables", () => {
    expect(reading).toMatch(
      /\.content\s*:where\(p,\s*ul,\s*ol,\s*dl\)\s*\{[^}]*max-width:\s*65ch/m,
    );
    expect(reading).not.toMatch(
      /\.content[^{]*(?:img|picture|table|figure|pre)[^{]*\{[^}]*max-width/m,
    );
  });

  it("sets comfortable leading on prose paragraphs", () => {
    expect(reading).toMatch(
      /\.content\s*:where\(p\)\s*\{[^}]*line-height:\s*1\.625/m,
    );
  });

  it("styles prose links with the theme primary, underline offset and hover weight", () => {
    expect(reading).toMatch(
      /\.content\s*:where\(a\):not\(\.btn\)\s*\{[^}]*color:\s*var\(--color-primary\)[^}]*text-underline-offset/m,
    );
    expect(reading).toMatch(/text-decoration-thickness:\s*2px/);
  });

  it("keeps blockquote links AA on the light quote background", () => {
    expect(reading).toMatch(
      /\.content\s*:where\(blockquote a\):not\(\.btn\)\s*\{[^}]*color:\s*var\(--color-text-dark\)/m,
    );
  });

  it("adapts links to dark mode", () => {
    expect(reading).toMatch(
      /\.dark\s+\.content\s*:where\(a\):not\(\.btn\)\s*\{[^}]*color:\s*var\(--color-darkmode-primary\)/m,
    );
  });

  it("shows a visible focus ring in both modes", () => {
    expect(reading).toMatch(
      /:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-primary\)[^}]*outline-offset/m,
    );
    expect(reading).toMatch(
      /\.dark\s+:focus-visible\s*\{[^}]*outline-color:\s*var\(--color-darkmode-primary\)/m,
    );
  });

  it("keeps long tokens overflow-safe instead of clipping or shrinking", () => {
    expect(reading).toMatch(
      /\.content\s*\{[^}]*overflow-wrap:\s*break-word/m,
    );
    expect(reading).toMatch(
      /\.content\s*:where\(a,\s*code,\s*td,\s*th\)\s*\{[^}]*overflow-wrap:\s*anywhere/m,
    );
    expect(reading).not.toMatch(/display:\s*none|visibility:\s*hidden/);
  });
});
