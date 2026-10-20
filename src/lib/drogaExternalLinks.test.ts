import { expect, test } from "vitest";
import {
  checkUrl,
  extractExternalLinks,
  isCheckablePublicUrl,
  normalizeUrl,
  runChecks,
  summarize,
  type FetchLike,
  type LinkCheckResult,
} from "./drogaExternalLinks";

// ---- extraction and normalisation ----------------------------------------------

test("external http(s) URLs are extracted from markdown text with trailing punctuation trimmed", () => {
  const text = [
    "See [the guide](https://example.com/guide) and <https://example.com/a b>.",
    "Bare autolink https://example.com/bare, then (https://example.com/in-parens).",
    "mailto:someone@example.com and ftp://example.com/x are not extracted.",
    "Internal site path /blog/x is not extracted.",
  ].join("\n");
  expect(extractExternalLinks(text)).toEqual([
    "https://example.com/guide",
    "https://example.com/a b",
    "https://example.com/bare",
    "https://example.com/in-parens",
  ]);
});

test("normalisation drops fragments, encodes raw spaces and rejects unparsable URLs", () => {
  expect(normalizeUrl("https://Example.com/a b?x=1#frag")).toBe("https://example.com/a%20b?x=1");
  expect(normalizeUrl("https://example.com:443/")).toBe("https://example.com/");
  expect(normalizeUrl("http://[::1]/x")).toBe("http://[::1]/x");
  expect(normalizeUrl("https://")).toBeNull();
});

test("a URL is checkable only when public http(s) without credentials or private destinations", () => {
  expect(isCheckablePublicUrl("https://example.com/a")).toEqual({ ok: true });
  expect(isCheckablePublicUrl("http://example.com:8080/a")).toEqual({ ok: true });
  expect(isCheckablePublicUrl("ftp://example.com/a").reason).toBe("not-http(s)");
  expect(isCheckablePublicUrl("https://user:pass@example.com/a").reason).toBe("credentials-in-url");
  expect(isCheckablePublicUrl("https://user@example.com/a").reason).toBe("credentials-in-url");
  expect(isCheckablePublicUrl("http://localhost:4321/").reason).toBe("private-destination");
  expect(isCheckablePublicUrl("http://127.0.0.1/").reason).toBe("private-destination");
  expect(isCheckablePublicUrl("http://10.0.0.5/").reason).toBe("private-destination");
  expect(isCheckablePublicUrl("http://192.168.1.1/").reason).toBe("private-destination");
  expect(isCheckablePublicUrl("http://172.16.0.9/").reason).toBe("private-destination");
  expect(isCheckablePublicUrl("http://169.254.1.1/").reason).toBe("private-destination");
  expect(isCheckablePublicUrl("http://[::1]/").reason).toBe("private-destination");
  expect(isCheckablePublicUrl("http://[fe80::1]/").reason).toBe("private-destination");
  expect(isCheckablePublicUrl("http://[fc00::1]/").reason).toBe("private-destination");
  expect(isCheckablePublicUrl("http://2130706433/").reason).toBe("private-destination");
  expect(isCheckablePublicUrl("http://127.1/").reason).toBe("private-destination");
  expect(isCheckablePublicUrl("http://0x7f.0.0.1/").reason).toBe("private-destination");
  expect(isCheckablePublicUrl("http://127.0.0.1.evil.example/").reason ?? "ok").toBe("ok");
  expect(isCheckablePublicUrl("not a url").reason).toBe("invalid-url");
});

// ---- single-URL check with an injected fetch ------------------------------------

/** Records every call and answers from a route table keyed "<METHOD> path". */
function fakeFetch(routes: Record<string, number | Error | { status: number; location?: string }>): {
  fetch: FetchLike;
  calls: { url: string; init: RequestInit }[];
} {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = async (url: string | URL, init: RequestInit = {}): Promise<Response> => {
    const urlText = typeof url === "string" ? url : url.toString();
    calls.push({ url: urlText, init });
    const parsed = new URL(urlText);
    const key = `${(init.method as string | undefined) ?? "GET"} ${parsed.pathname}`;
    const route = routes[key];
    if (route === undefined) throw new TypeError("fetch failed: no route");
    const status = route instanceof Error ? route : typeof route === "number" ? { status: route } : route;
    if (status instanceof Error) throw status;
    const headers: Record<string, string> = {};
    if (status.location !== undefined) headers.location = status.location;
    return new Response("fixture-body", { status: status.status, headers });
  };
  return { fetch, calls };
}

test("HEAD 200 proves reachability without a GET fallback", async () => {
  const { fetch, calls } = fakeFetch({ "HEAD /ok": 200 });
  const result = await checkUrl("https://example.com/ok", { fetchImpl: fetch });
  expect(result.outcome).toBe("reachable");
  expect(result.method).toBe("head");
  expect(calls).toHaveLength(1);
});

test("HEAD 404 with GET 200 is reachable through the fallback (support.google.com pattern)", async () => {
  const { fetch, calls } = fakeFetch({ "HEAD /doc": 404, "GET /doc": 200 });
  const result = await checkUrl("https://example.com/doc", { fetchImpl: fetch });
  expect(result.outcome).toBe("reachable");
  expect(result.method).toBe("get-fallback");
  expect(calls).toHaveLength(2);
});

test("HEAD 404 with GET 404 is dead: the GET fallback fails the link", async () => {
  const { fetch } = fakeFetch({ "HEAD /gone": 404, "GET /gone": 404 });
  const result = await checkUrl("https://example.com/gone", { fetchImpl: fetch });
  expect(result.outcome).toBe("dead");
  expect(result.status).toBe(404);
});

test("429 on both methods is rate-limited, never dead", async () => {
  const { fetch } = fakeFetch({ "HEAD /busy": 429, "GET /busy": 429 });
  expect((await checkUrl("https://example.com/busy", { fetchImpl: fetch })).outcome).toBe("rate-limited");
});

test("403 on both methods is blocked (bot-blocking), never dead", async () => {
  const { fetch } = fakeFetch({ "HEAD /bot": 403, "GET /bot": 403 });
  expect((await checkUrl("https://example.com/bot", { fetchImpl: fetch })).outcome).toBe("blocked");
});

test("a timeout stays unknown, never dead", async () => {
  const timeout = Object.assign(new Error("too slow"), { name: "TimeoutError" });
  const { fetch } = fakeFetch({ "HEAD /slow": timeout, "GET /slow": timeout });
  const result = await checkUrl("https://example.com/slow", { fetchImpl: fetch, timeoutMs: 10 });
  expect(result.outcome).toBe("unknown");
  expect(result.detail).toBe("timeout");
});

test("a network failure stays unknown, never dead", async () => {
  const { fetch } = fakeFetch({ "HEAD /down": new TypeError("fetch failed") });
  const result = await checkUrl("https://example.com/down", { fetchImpl: fetch });
  expect(result.outcome).toBe("unknown");
  expect(result.detail).toBe("network");
});

test("redirects are followed to a reachable destination and the final URL is reported", async () => {
  const { fetch, calls } = fakeFetch({
    "HEAD /hop": { status: 302, location: "/target" },
    "HEAD /target": 200,
  });
  const result = await checkUrl("https://example.com/hop", { fetchImpl: fetch });
  expect(result.outcome).toBe("reachable");
  expect(result.finalUrl).toBe("https://example.com/target");
  expect(calls).toHaveLength(2);
});

test("a public URL redirecting into a private network is blocked and never fetched there", async () => {
  const { fetch, calls } = fakeFetch({
    "HEAD /pivot": { status: 302, location: "http://127.0.0.1:9/inside" },
  });
  const result = await checkUrl("https://example.com/pivot", { fetchImpl: fetch });
  expect(result.outcome).toBe("blocked");
  expect(result.detail).toContain("private");
  expect(calls.map((c) => c.url)).toEqual(["https://example.com/pivot"]);
});

test("a redirect to a credential-bearing URL is blocked before any fetch", async () => {
  const { fetch, calls } = fakeFetch({
    "HEAD /pivot": { status: 301, location: "https://user:secret@example.com/x" },
  });
  const result = await checkUrl("https://example.com/pivot", { fetchImpl: fetch });
  expect(result.outcome).toBe("blocked");
  expect(calls).toHaveLength(1);
});

test("too many redirects classify as redirected, not reachable", async () => {
  const { fetch, calls } = fakeFetch({
    "HEAD /loop": { status: 302, location: "/loop" },
  });
  const result = await checkUrl("https://example.com/loop", { fetchImpl: fetch, maxRedirects: 3 });
  expect(result.outcome).toBe("redirected");
  expect(calls.length).toBeLessThanOrEqual(4);
});

test("the GET fallback is byte-bounded: a Range header is sent and the body is not drained", async () => {
  const { fetch, calls } = fakeFetch({ "HEAD /big": 404, "GET /big": 200 });
  const result = await checkUrl("https://example.com/big", { fetchImpl: fetch, maxBytes: 2048 });
  expect(result.outcome).toBe("reachable");
  const get = calls[1];
  expect((get.init.headers as Record<string, string>).range).toBe("bytes=0-2047");
});

test("every request carries the site user agent and a per-request timeout signal", async () => {
  const { fetch, calls } = fakeFetch({ "HEAD /ua": 200 });
  await checkUrl("https://example.com/ua", { fetchImpl: fetch, timeoutMs: 500 });
  const init = calls[0].init;
  expect((init.headers as Record<string, string>)["user-agent"]).toContain("droga.ww86.eu");
  expect(init.signal).toBeInstanceOf(AbortSignal);
});

// ---- batch behaviour -------------------------------------------------------------

test("duplicate URLs are checked once and concurrency stays within the bound", async () => {
  let inFlight = 0;
  let peak = 0;
  const fetch = async (url: string | URL): Promise<Response> => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight--;
    return new Response(null, { status: 200 });
  };
  const results = await runChecks(
    [
      { url: "https://example.com/a", files: ["p1.md", "p2.md"] },
      { url: "https://example.com/a#frag", files: ["p3.md"] },
      { url: "https://example.com/b", files: ["p1.md"] },
      { url: "https://example.com/c", files: ["p2.md"] },
      { url: "https://example.com/d", files: ["p3.md"] },
    ],
    { fetchImpl: fetch, concurrency: 2 },
  );
  expect(results.checks.map((c) => c.url)).toEqual(["https://example.com/a", "https://example.com/b", "https://example.com/c", "https://example.com/d"]);
  expect(peak).toBeLessThanOrEqual(2);
  expect(results.checks.find((c) => c.url === "https://example.com/a")?.files).toEqual(["p1.md", "p2.md", "p3.md"]);
});

test("policy-refused URLs in content are reported, never fetched", async () => {
  const { fetch, calls } = fakeFetch({});
  const results = await runChecks(
    [
      { url: "http://localhost:4321/dev", files: ["post.md"] },
      { url: "https://secret:token@example.com/x", files: ["post.md"] },
    ],
    { fetchImpl: fetch },
  );
  expect(results.refused).toHaveLength(2);
  expect(results.refused.map((r) => r.reason)).toEqual(["private-destination", "credentials-in-url"]);
  expect(calls).toHaveLength(0);
});

test("the summary counts every outcome and lists dead links as findings", () => {
  const checks: LinkCheckResult[] = [
    { url: "https://a/1", files: ["a.md"], outcome: "reachable", method: "head", finalUrl: "https://a/1" },
    { url: "https://a/2", files: ["a.md"], outcome: "dead", method: "get-fallback", finalUrl: "https://a/2", status: 404 },
    { url: "https://a/3", files: ["a.md"], outcome: "unknown", method: "get-fallback", finalUrl: "https://a/3", detail: "timeout" },
    { url: "https://a/4", files: ["a.md"], outcome: "rate-limited", method: "head", finalUrl: "https://a/4", status: 429 },
  ];
  const summary = summarize({ checks, refused: [] });
  expect(summary.counts).toEqual({
    reachable: 1,
    dead: 1,
    redirected: 0,
    blocked: 0,
    "rate-limited": 1,
    unknown: 1,
  });
  expect(summary.deadUrls).toEqual(["https://a/2"]);
});
