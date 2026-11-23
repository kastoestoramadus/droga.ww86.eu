import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.argv[2] ?? "dist";
const problems = [];

const htmlFiles = (dir) => {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...htmlFiles(path));
    } else if (entry.endsWith(".html")) {
      found.push(path);
    }
  }
  return found;
};

const visibleText = (html) => {
  const withoutWidgets = html.replace(
    /<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/g,
    " ",
  );
  return withoutWidgets.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
};

for (const file of htmlFiles(root)) {
  const rel = relative(root, file);
  if (rel.startsWith("en/") || rel.startsWith("preview/")) continue;
  const text = visibleText(readFileSync(file, "utf8"));
  for (const word of ["Categories", "Tags", "Share", "Related Posts", "Contact"]) {
    if (new RegExp(`\\b${word}\\b`).test(text)) {
      problems.push(`${rel}: visible English "${word}"`);
    }
  }
}

for (const [file, feed] of [
  [join(root, "index.html"), "/rss.xml"],
  [join(root, "en", "index.html"), "/en/rss.xml"],
]) {
  const html = readFileSync(file, "utf8");
  if (!new RegExp(`<a[^>]+href="${feed.replace("/", "\\/")}"`).test(html)) {
    problems.push(`${relative(root, file)}: footer has no ${feed} link`);
  }
}

if (problems.length) {
  console.error(`flat nav page check: ${problems.length} problems`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log("flat nav page check: OK");
