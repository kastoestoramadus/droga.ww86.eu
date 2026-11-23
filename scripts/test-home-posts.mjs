import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const config = JSON.parse(
  fs.readFileSync(path.join(root, "src/config/config.json"), "utf8"),
);
const homePosts = config.settings.home_posts;
const posts = JSON.parse(
  fs.readFileSync(path.join(root, ".json/posts.json"), "utf8"),
);

const problems = [];
const check = (condition, message) => {
  if (!condition) problems.push(message);
};

const stubUrls = [
  ["dist/authors/index.html", "/about"],
  ["dist/authors/waldemar-wosiński/index.html", "/about"],
  ["dist/en/authors/index.html", "/en/about"],
  ["dist/en/authors/waldemar-wosiński/index.html", "/en/about"],
];

for (const [file, target] of stubUrls) {
  const full = path.join(root, file);
  check(fs.existsSync(full), `missing author stub ${file}`);
  if (!fs.existsSync(full)) continue;
  const html = fs.readFileSync(full, "utf8");
  check(
    html.includes('http-equiv="refresh"') && html.includes(target),
    `${file} has no meta refresh to ${target}`,
  );
  check(
    html.includes('rel="canonical"') && html.includes(target),
    `${file} has no canonical to ${target}`,
  );
  check(html.includes("noindex"), `${file} is not noindex`);
}

for (const [file, prefix, lang, label] of [
  ["dist/index.html", "/blog/", "pl", "Wszystkie wpisy"],
  ["dist/en/index.html", "/en/blog/", "en", "All posts"],
]) {
  const full = path.join(root, file);
  check(fs.existsSync(full), `missing ${file}`);
  if (!fs.existsSync(full)) continue;
  const html = fs.readFileSync(full, "utf8");
  const found = [
    ...new Set(
      [...html.matchAll(/href="([^"]*\/blog\/[^"/]+\/?)"/g)].map((m) => m[1]),
    ),
  ];
  const expected = posts
    .filter((p) => p.lang === lang)
    .sort((a, b) => new Date(b.frontmatter?.date ?? 0) - new Date(a.frontmatter?.date ?? 0))
    .slice(0, homePosts)
    .map((p) => `${prefix}${p.slug.split("/").pop()}`);
  check(found.length > 0, `${file} lists no posts`);
  check(found.length <= homePosts, `${file} lists ${found.length} > ${homePosts} posts`);
  check(
    JSON.stringify(found) === JSON.stringify(expected),
    `${file} post order differs: got ${JSON.stringify(found)}, expected ${JSON.stringify(expected)}`,
  );
  check(
    !html.includes("testimonial-slider") && !html.includes('alt="cta-image"'),
    `${file} still contains testimonial/CTA markup`,
  );
  check(!html.includes("/authors/"), `${file} still links to /authors/`);
  // The 1200x380 banner pushed the first post title below the fold of a 1366x768 screen (measured 771 px).
  check(!html.includes('alt="banner"'), `${file} still shows the banner image above the posts`);
  const allPosts = posts.filter((p) => p.lang === lang).length;
  if (allPosts > homePosts) {
    check(
      html.includes(label) && html.includes(`>${label}<`),
      `${file} has no "${label}" link`,
    );
  }
}

for (const [file, needle] of [
  ["dist/sitemap-0.xml", "/authors"],
  ["dist/llms.txt", "/authors"],
  ["dist/llms-full.txt", "/authors"],
  [".json/search.json", "/authors"],
]) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) continue;
  check(!fs.readFileSync(full, "utf8").includes(needle), `${file} contains ${needle}`);
}

if (problems.length) {
  console.error(`FAIL: ${problems.length} problem(s)`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log("OK: homepage posts, author stubs and indexes");
