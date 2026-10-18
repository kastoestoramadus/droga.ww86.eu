import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "node-html-parser";

function* htmlFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(path);
    else if (entry.name === "index.html") yield path;
  }
}

let posts = 0;
for (const file of htmlFiles("dist")) {
  const doc = parse(readFileSync(file, "utf8"));
  const shares = doc.querySelectorAll("article a[aria-label$='share button']");
  if (!shares.length) continue;
  const route = "/" + relative("dist", file).replace(/\/index\.html$/, "");
  for (const link of shares) {
    const url = new URL(link.getAttribute("href").replaceAll("&amp;", "&"));
    const target = new URL(url.searchParams.get(url.hostname.includes("facebook") ? "u" : "url"));
    assert.equal(decodeURI(target.pathname).replace(/\/$/, ""), route, `Share URL on ${route}`);
  }
  const options = doc.querySelectorAll("header select option");
  assert.ok(options.length >= 2, `Language options on ${route}`);
  for (const option of options) {
    const target = option.getAttribute("data-path");
    assert.ok(target, `Translated route for ${option.getAttribute("value")} on ${route}`);
    assert.ok(existsSync(join("dist", decodeURI(target), "index.html")), `Missing translated page: ${target}`);
  }
  posts++;
}
assert.ok(posts > 0, "No built posts checked");
console.log(`Post share and translation links: ${posts} pages passed`);
