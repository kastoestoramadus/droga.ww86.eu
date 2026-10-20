// Bounded public external-link checker for Droga publication content.
//
// Usage:
//   node scripts/droga-check-external-links.mjs inventory [--content DIR] [--json FILE]
//   node scripts/droga-check-external-links.mjs live       [--content DIR] [--json FILE]
//   node scripts/droga-check-external-links.mjs fixture
//
// inventory  Offline default: extracts http(s) URLs from publication content (src/content),
//            deduplicates them with file provenance and applies the destination policy.
//            Never opens a network connection.
// live       Fetches the extracted public links: HEAD with a byte-bounded GET fallback,
//            concurrency 2, 250 ms pause between requests, 10 s timeout, 5 redirect hops.
//            Only dead links fail the run; blocked/rate-limited/unknown stay visible findings.
// fixture    Repeatable suite against a task-owned loopback server on an ephemeral port
//            (127.0.0.1 only, started and stopped by this process). No public network is touched.
//
// Exit status: 0 findings pass, 1 dead links found (or fixture failure), 2 usage error.
// No cookies, no authentication, no credentials: loopback/private/link-local destinations and
// credential-bearing URLs are refused before any request, including redirect targets, so a
// public URL cannot pivot the checker into a private network.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectPublicLinks,
  defaultUserAgent,
  extractExternalLinks,
  runChecks,
  summarize,
} from "../src/lib/drogaExternalLinks.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const USAGE = `usage: node scripts/droga-check-external-links.mjs <inventory|live|fixture> [--content DIR] [--json FILE]`;

function readFlags(argv) {
  const flags = { content: join(repoRoot, "src/content"), json: undefined };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--content") flags.content = argv[++i];
    else if (argv[i] === "--json") flags.json = argv[++i];
    else {
      console.error(`unknown argument: ${argv[i]}\n${USAGE}`);
      process.exit(2);
    }
  }
  return flags;
}

function toPosix(path) {
  return path.split(sep).join("/");
}

function* contentFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* contentFiles(path);
    else if (/\.(md|mdx)$/.test(entry.name)) yield path;
  }
}

function collectFromContent(contentRoot) {
  const occurrences = [];
  for (const file of contentFiles(contentRoot)) {
    const rel = toPosix(relative(repoRoot, file));
    for (const url of extractExternalLinks(readFileSync(file, "utf8"))) occurrences.push({ url, files: [rel] });
  }
  return collectPublicLinks(occurrences);
}

function printRefused(refused) {
  if (refused.length === 0) return;
  console.log(`  refused by policy (${refused.length}) — reported, not fetched, not deleted:`);
  for (const link of refused) console.log(`    [${link.reason}] ${link.url}  in: ${link.files.join(", ")}`);
}

function writeJson(target, payload) {
  writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`results written to ${target}`);
}

const mode = process.argv[2];
if (mode === undefined) {
  console.error(USAGE);
  process.exit(2);
}
const flags = readFlags(process.argv.slice(3));

if (mode === "inventory") {
  const { links, refused } = collectFromContent(flags.content);
  console.log(`External-link inventory of ${flags.content} (offline, nothing fetched)`);
  console.log(`  ${links.length} checkable public link(s), ${refused.length} refused by policy`);
  for (const link of links) console.log(`    ${link.url}  in: ${link.files.join(", ")}`);
  printRefused(refused);
  if (flags.json !== undefined)
    writeJson(flags.json, { mode, fetchedAt: null, note: "offline inventory, no request was made", links, refused });
  process.exit(0);
}

if (mode === "live") {
  const fetchedAt = new Date().toISOString();
  const { links, refused } = collectFromContent(flags.content);
  console.log(`Live external-link check of ${flags.content} — started ${fetchedAt}`);
  console.log(`  bounds: HEAD + byte-bounded GET fallback, concurrency 2, 250 ms pause, timeout 10 s, 5 redirects, UA "${defaultUserAgent}"`);
  console.log(`  limits: a hostname that resolves into a private range is invisible without DNS; 401/403 means bot-block, not dead`);
  const result = await runChecks(links, {
    fetchImpl: fetch,
    concurrency: 2,
    delayMs: 250,
    timeoutMs: 10_000,
    maxBytes: 2048,
    maxRedirects: 5,
  });
  for (const check of result.checks) {
    const via = check.method === "head" ? "" : ` (GET fallback)`;
    const detail = check.detail !== undefined ? ` — ${check.detail}` : "";
    console.log(`  ${check.outcome.padEnd(12)} ${check.status ?? "—"} ${check.url}${via}${detail}`);
    console.log(`              in: ${check.files.join(", ")}`);
  }
  printRefused(result.refused);
  const summary = summarize(result);
  console.log(`  counts: ${JSON.stringify(summary.counts)}`);
  console.log(`  fetched at ${fetchedAt}; only "dead" fails this run — blocked/rate-limited/unknown/redirected need a human browser check`);
  if (flags.json !== undefined)
    writeJson(flags.json, { mode, fetchedAt, bounds: { concurrency: 2, delayMs: 250, timeoutMs: 10000, maxBytes: 2048, maxRedirects: 5 }, result, summary });
  process.exit(summary.counts.dead > 0 ? 1 : 0);
}

if (mode === "fixture") {
  const requests = [];
  let fixtureServer;
  const port = await new Promise((resolvePort) => {
    const server = createServer((req, res) => {
      const pathname = decodeURIComponent(new URL(req.url, "http://fixture.test").pathname);
      requests.push(`${req.method} ${pathname}`);
      const send = (status, headers = {}, body = "") => {
        try {
          res.writeHead(status, headers);
          res.end(body);
        } catch {
          // the reader cancels the body early by design; a broken pipe is expected
        }
      };
      if (pathname === "/head404-get200") {
        if (req.method === "HEAD") send(404);
        else send(200, { "content-type": "text/html" }, "<p>fixture</p>");
      } else if (pathname === "/head404-get404") send(404);
      else if (pathname === "/rate-limited") send(429, { "retry-after": "60" });
      else if (pathname === "/slow") setTimeout(() => send(200), 3000);
      else if (pathname === "/spaced%20path" || pathname === "/spaced path") send(200, {}, "spaced");
      else if (pathname === "/pivot") send(302, { location: "http://127.0.0.1:9/inside" });
      else if (pathname === "/chain") send(302, { location: "https://fixture.test/head404-get200" });
      else if (pathname === "/ok") send(200, {}, "ok");
      else send(404);
    });
    server.listen(0, "127.0.0.1", () => resolvePort(server.address().port));
    fixtureServer = server;
  });

  // The synthetic host fixture.test stays "public" for the policy; only the transport is remapped
  // to the task-owned loopback server, so the whole classification path runs unmodified.
  const mappingFetch = (url, init) => fetch(url.replace("https://fixture.test", `http://127.0.0.1:${port}`), init);
  const cases = [
    { url: "https://fixture.test/ok", expect: { outcome: "reachable", method: "head" } },
    { url: "https://fixture.test/head404-get200", expect: { outcome: "reachable", method: "get-fallback" } },
    { url: "https://fixture.test/head404-get404", expect: { outcome: "dead", method: "get-fallback", status: 404 } },
    { url: "https://fixture.test/rate-limited", expect: { outcome: "rate-limited" } },
    { url: "https://fixture.test/slow", expect: { outcome: "unknown", detail: "timeout" } },
    { url: "https://fixture.test/spaced path", expect: { outcome: "reachable" } },
    { url: "https://fixture.test/pivot", expect: { outcome: "blocked" } },
    { url: "https://fixture.test/chain", expect: { outcome: "reachable", finalUrl: "https://fixture.test/head404-get200" } },
  ];
  const { checks, refused } = await runChecks(cases.map((c) => ({ url: c.url, files: ["fixture"] })), {
    fetchImpl: mappingFetch,
    concurrency: 2,
    timeoutMs: 700,
    maxBytes: 2048,
    userAgent: "DrogaFixtureSuite/1.0",
  });
  let failures = 0;
  for (const testCase of cases) {
    const check = checks.find((c) => c.url === testCase.url.replace(" ", "%20"));
    const problems = Object.entries(testCase.expect).filter(([key, value]) => check?.[key] !== value);
    if (check === undefined || problems.length > 0) {
      failures++;
      console.error(`  FAIL ${testCase.url}: expected ${JSON.stringify(testCase.expect)}, got ${JSON.stringify(check)}`);
    } else {
      console.log(`  pass ${testCase.url} -> ${check.outcome}${check.status !== undefined ? ` (${check.status})` : ""}`);
    }
  }
  const pivotFetches = requests.filter((r) => r.startsWith("GET /pivot")).length;
  if (pivotFetches !== 0) {
    failures++;
    console.error(`  FAIL redirect pivot: the blocked HEAD must not be retried with GET, saw ${pivotFetches}`);
  }
  if (requests.some((r) => r.includes("/inside"))) {
    failures++;
    console.error("  FAIL redirect pivot: a request reached the private destination");
  }
  console.log(`  server saw ${requests.length} request(s): ${requests.join(", ")}`);
  console.log(`  refused: ${refused.length} (expected 0)`);
  await new Promise((resolve) => {
    fixtureServer.closeAllConnections();
    fixtureServer.close(() => resolve());
  });
  if (failures > 0) {
    console.error(`${failures} fixture failure(s)`);
    process.exit(1);
  }
  console.log("Fixture suite: all cases behaved as specified (server stopped)");
  process.exit(0);
}

console.error(`unknown mode: ${mode}\n${USAGE}`);
process.exit(2);
