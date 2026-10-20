import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readStyle = (name: string): string =>
  readFileSync(new URL(name, import.meta.url), "utf8");

const reading = readStyle("droga-reading.css");
const printStart = reading.indexOf("@media print");
const screenPart = printStart === -1 ? reading : reading.slice(0, printStart);
const printPart = printStart === -1 ? "" : reading.slice(printStart);

describe("droga-reading.css contract", () => {
  const main = readStyle("main.css");

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
    expect(reading).toMatch(/\.content\s*\{[^}]*overflow-wrap:\s*break-word/m);
    expect(reading).toMatch(
      /\.content\s*:where\(a,\s*code,\s*td,\s*th\)\s*\{[^}]*overflow-wrap:\s*anywhere/m,
    );
    // Nothing is hidden on screen; the print block may hide site chrome.
    expect(screenPart).not.toMatch(/display:\s*none|visibility:\s*hidden/);
  });
});

describe("droga-reading.css step 2: optional sections, anchors, motion, print", () => {
  it("separates stacked details sections and marks summaries as controls", () => {
    expect(screenPart).toMatch(
      /\.content\s*:where\(details\)\s*\{[^}]*margin-block/m,
    );
    expect(screenPart).toMatch(
      /\.content\s*:where\(summary\)\s*\{[^}]*cursor:\s*pointer[^}]*font-weight:\s*600/m,
    );
  });

  it("keeps optional sections closed on screen (no forced-open rule)", () => {
    expect(screenPart).not.toMatch(/::details-content/);
    expect(screenPart).not.toMatch(/\[open\]/);
  });

  it("clears the sticky header for in-page heading anchors", () => {
    expect(screenPart).toMatch(
      /\.content\s*:where\(h1,\s*h2,\s*h3,\s*h4,\s*h5,\s*h6\)\s*\{[^}]*scroll-margin-top/m,
    );
  });

  it("honours prefers-reduced-motion for the theme's UI transitions", () => {
    expect(screenPart).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)\s*\{/);
    expect(screenPart).toMatch(/transition-duration:\s*0\.01ms/);
    expect(screenPart).toMatch(/scroll-behavior:\s*auto/);
  });

  it("print: hides site chrome but never article media or optional sections", () => {
    expect(printPart).toMatch(/\.header[^{]*\{[^}]*display:\s*none/m);
    expect(printPart).toMatch(/footer[^{]*\{[^}]*display:\s*none/m);
    expect(printPart).toMatch(/\.social-icons[^{]*\{[^}]*display:\s*none/m);
    expect(printPart).toMatch(
      /div\.section\.pb-0[^{]*\{[^}]*display:\s*none/m,
    );
    // The tags/share row needs !important: its .row display lives in the
    // utilities layer, which outranks this file's components layer.
    expect(printPart).toMatch(
      /article\s*>\s*\.row\s*\{[^}]*display:\s*none\s*!important/m,
    );
    expect(printPart).not.toMatch(
      /(?:figure|img|picture|details|summary)[^{]*\{[^}]*display:\s*none/m,
    );
  });

  it("print: forces light ink even when the reader is in dark mode", () => {
    expect(printPart).toMatch(/\.dark\s+body\s*\{[^}]*background/m);
    expect(printPart).toMatch(
      /\.dark\s+\.content\s*:where\(a\):not\(\.btn\)[^{]*\{[^}]*color:\s*inherit/m,
    );
  });

  it("print: reveals closed optional sections (progressive enhancement)", () => {
    expect(printPart).toMatch(
      /details:not\(\[open\]\)::details-content\s*\{[^}]*content-visibility:\s*visible/m,
    );
  });

  it("print: expands external link URLs so sources survive paper", () => {
    expect(printPart).toMatch(
      /a\[href\^="http"\][^{]*::after\s*\{[^}]*content:\s*" \("? ?attr\(href\)/m,
    );
  });

  it("print: wraps code and keeps media off page breaks", () => {
    expect(printPart).toMatch(/pre\s*\{[^}]*white-space:\s*pre-wrap/m);
    expect(printPart).toMatch(/break-inside:\s*avoid/);
  });
});
