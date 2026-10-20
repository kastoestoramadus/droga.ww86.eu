/**
 * Bounded public external-link checking for Droga publication content. The library is pure: the
 * fetch function is injected, so the classification logic is testable without any network.
 *
 * Classification never treats a 403, a 429 or a timeout as dead or as success: the outcomes are
 * reachable, dead, redirected, blocked, rate-limited and unknown, and the caller decides which
 * fail the run. A public URL whose redirect chain tries to pivot into a private or credential-
 * bearing destination is blocked before that destination is fetched.
 */

export type LinkOutcome = "reachable" | "dead" | "redirected" | "blocked" | "rate-limited" | "unknown";

export type RefusalReason = "not-http(s)" | "credentials-in-url" | "private-destination" | "invalid-url";

export interface PolicyVerdict {
  readonly ok: boolean;
  readonly reason?: RefusalReason;
}

/** Anything the checker can call: the real global fetch in the script, fakes in tests. */
export type FetchLike = (url: string | URL, init?: RequestInit) => Promise<Response>;

export interface PublicLink {
  /** Normalised URL: no fragment, lowercase host, raw spaces percent-encoded. */
  readonly url: string;
  readonly files: readonly string[];
}

export interface CheckOptions {
  readonly fetchImpl: FetchLike;
  /** Per-request timeout; an AbortError from it stays "unknown", never "dead". */
  readonly timeoutMs?: number;
  /** Redirect hops followed per request; more classify as "redirected". */
  readonly maxRedirects?: number;
  /** GET fallback body bound in bytes; a Range header asks the server for exactly this much. */
  readonly maxBytes?: number;
  readonly userAgent?: string;
}

export interface LinkCheckResult {
  readonly url: string;
  /** Source files referencing the URL; batch runs attach them, single checks omit them. */
  readonly files?: readonly string[];
  readonly outcome: LinkOutcome;
  readonly method: "head" | "get-fallback";
  /** Final HTTP status that decided the outcome, when one arrived. */
  readonly status?: number;
  /** URL after following redirects (the original when none were followed). */
  readonly finalUrl: string;
  /** Human-readable qualifier: "timeout", "network", "bot-block", "private destination", ... */
  readonly detail?: string;
}

export interface BatchOptions extends CheckOptions {
  /** Upper bound on requests in flight at once. */
  readonly concurrency?: number;
  /** Pause between two requests of the same worker, for polite live checking. */
  readonly delayMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface RefusedLink {
  readonly url: string;
  readonly files: readonly string[];
  readonly reason: RefusalReason;
}

export interface BatchResult {
  readonly checks: readonly LinkCheckResult[];
  readonly refused: readonly RefusedLink[];
}

export type OutcomeCounts = Record<LinkOutcome, number>;

/**
 * Extracts raw http(s) URLs from publication text. Angle-bracket autolinks may contain raw spaces;
 * every other form ends at whitespace. Trailing sentence punctuation is not part of a URL, and a
 * closing parenthesis is kept only when the URL itself contains an opening one.
 */
export function extractExternalLinks(text: string): string[] {
  const found: { at: number; url: string }[] = [];
  const consumed: [number, number][] = [];

  for (const match of text.matchAll(/<https?:\/\/[^>]*>/gi)) {
    const start = match.index ?? 0;
    found.push({ at: start, url: match[0].slice(1, -1) });
    consumed.push([start, start + match[0].length]);
  }
  const isConsumed = (at: number): boolean => consumed.some(([from, to]) => at >= from && at < to);

  for (const match of text.matchAll(/https?:\/\/[^\s<>"'`]+/gi)) {
    const start = match.index ?? 0;
    if (isConsumed(start)) continue; // angle-bracket form already taken
    let candidate = match[0].replace(/[.,;:!?]+$/, "");
    if (candidate.endsWith(")") && !candidate.includes("(")) candidate = candidate.slice(0, -1);
    found.push({ at: start, url: candidate });
  }
  return found.sort((a, b) => a.at - b.at).map((entry) => entry.url);
}

/**
 * Normalises a raw URL for checking: fragments are dropped (they never travel to the server), the
 * scheme and host are lowercased, default ports disappear and raw spaces are percent-encoded the
 * way a browser would send them. Returns null when the URL cannot be parsed at all.
 */
export function normalizeUrl(raw: string): string | null {
  const withoutFragment = raw.split("#")[0];
  const spaceEncoded = withoutFragment.includes(" ") ? withoutFragment.replaceAll(" ", "%20") : withoutFragment;
  try {
    return new URL(spaceEncoded).href;
  } catch {
    return null;
  }
}

/**
 * Decides whether a URL names a destination the checker may contact: public http(s) only. Non-http(s)
 * schemes, embedded credentials and loopback/private/link-local hosts are refused. Only literal IP
 * hosts and "localhost" can be judged without DNS; a hostname that resolves into a private range is
 * invisible here, which the script states in its output.
 */
export function isCheckablePublicUrl(url: string): PolicyVerdict {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "invalid-url" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { ok: false, reason: "not-http(s)" };
  if (parsed.username !== "" || parsed.password !== "") return { ok: false, reason: "credentials-in-url" };
  if (isPrivateHost(parsed.hostname)) return { ok: false, reason: "private-destination" };
  return { ok: true };
}

/**
 * Checks one URL: HEAD first, and a byte-bounded GET fallback whenever HEAD does not prove
 * reachability (some sites, like support.google.com, answer 404 to HEAD and 200 to GET). Redirects
 * are followed manually so every hop is policy-checked: a public URL that redirects into a private
 * or credential-bearing destination is blocked, not fetched.
 */
export async function checkUrl(url: string, options: CheckOptions): Promise<LinkCheckResult> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxRedirects = options.maxRedirects ?? 5;
  const maxBytes = options.maxBytes ?? 2048;
  const userAgent = options.userAgent ?? defaultUserAgent;

  const attempt = async (method: "HEAD" | "GET"): Promise<LinkCheckResult> => {
    let current = url;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const verdict = isCheckablePublicUrl(current);
      if (!verdict.ok) return blockedResult(url, method, current, describeRefusal(verdict));
      const response = await request(current, method, { timeoutMs, maxBytes, userAgent, fetchImpl: options.fetchImpl });
      if (response === undefined) {
        return {
          url,
          outcome: "unknown",
          method: method === "HEAD" ? "head" : "get-fallback",
          finalUrl: current,
          detail: lastNetworkError,
        };
      }
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400) {
        if (location === null) return { url, outcome: "redirected", method: method === "HEAD" ? "head" : "get-fallback", status: response.status, finalUrl: current, detail: "3xx without a location header" };
        const next = resolveRedirect(location, current);
        if (next === null) return blockedResult(url, method, current, "refuses redirect to invalid URL");
        if (hop === maxRedirects) return { url, outcome: "redirected", method: method === "HEAD" ? "head" : "get-fallback", status: response.status, finalUrl: current, detail: `more than ${maxRedirects} redirects` };
        current = next;
        continue;
      }
      if (method === "GET") await drainBounded(response, maxBytes);
      return {
        url,
        ...classify(response.status),
        method: method === "HEAD" ? "head" : "get-fallback",
        status: response.status,
        finalUrl: current,
      };
    }
    return { url, outcome: "redirected", method: method === "HEAD" ? "head" : "get-fallback", finalUrl: current, detail: `more than ${maxRedirects} redirects` };
  };

  const head = await attempt("HEAD");
  if (head.outcome === "reachable") return head;
  // The GET fallback exists for method-specific HEAD failures (404/403/405 to HEAD, flaky network).
  // A policy block, an over-long redirect chain or a 429 must not be retried: the first repeats the
  // refused request, the second the same chain, the third would hammer a rate-limiting server.
  if (head.outcome === "redirected" || head.outcome === "rate-limited") return head;
  if (head.outcome === "blocked" && head.status === undefined) return head;
  return attempt("GET");
}

/**
 * Normalises and merges raw link occurrences into the checkable set and the refused set, without
 * any network: the offline inventory mode of the script uses this alone.
 */
export function collectPublicLinks(links: readonly PublicLink[]): { links: PublicLink[]; refused: RefusedLink[] } {
  const byUrl = new Map<string, PublicLink>();
  const refused = new Map<string, RefusedLink>();
  for (const link of links) {
    const normalized = normalizeUrl(link.url);
    if (normalized === null) {
      refused.set(link.url, { url: link.url, files: link.files, reason: "invalid-url" });
      continue;
    }
    const verdict = isCheckablePublicUrl(normalized);
    if (!verdict.ok) {
      refused.set(normalized, { url: normalized, files: link.files, reason: verdict.reason ?? "invalid-url" });
      continue;
    }
    const existing = byUrl.get(normalized);
    byUrl.set(normalized, {
      url: normalized,
      files: existing ? [...new Set([...existing.files, ...link.files])] : [...new Set(link.files)],
    });
  }
  return {
    links: [...byUrl.values()].sort((a, b) => a.url.localeCompare(b.url)),
    refused: [...refused.values()].sort((a, b) => a.url.localeCompare(b.url)),
  };
}

/**
 * Checks a deduplicated link list with a concurrency bound and a per-worker pause. URLs the policy
 * refuses are reported, never fetched. The input is normalised and merged here, so callers pass
 * raw occurrences with their source files.
 */
export async function runChecks(links: readonly PublicLink[], options: BatchOptions): Promise<BatchResult> {
  const concurrency = Math.max(1, options.concurrency ?? 2);
  const delayMs = options.delayMs ?? 0;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const { links: queue, refused } = collectPublicLinks(links);
  const checks: LinkCheckResult[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < queue.length) {
      const link = queue[next++];
      checks.push({ ...await checkUrl(link.url, options), files: link.files });
      if (delayMs > 0 && next < queue.length) await sleep(delayMs);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  checks.sort((a, b) => a.url.localeCompare(b.url));
  return { checks, refused };
}

export interface RunSummary {
  readonly counts: OutcomeCounts;
  readonly deadUrls: readonly string[];
}

/** Counts every outcome and collects the dead URLs, which are the only run-failing findings. */
export function summarize(result: BatchResult): RunSummary {
  const counts: OutcomeCounts = { reachable: 0, dead: 0, redirected: 0, blocked: 0, "rate-limited": 0, unknown: 0 };
  const deadUrls: string[] = [];
  for (const check of result.checks) {
    counts[check.outcome]++;
    if (check.outcome === "dead") deadUrls.push(check.url);
  }
  return { counts, deadUrls };
}

export const defaultUserAgent = "DrogaExternalLinkCheck/1.0 (https://droga.ww86.eu; publication integrity check)";

let lastNetworkError = "network";

function classify(status: number): { outcome: LinkOutcome; detail?: string } {
  if (status >= 200 && status < 300) return { outcome: "reachable" };
  if (status >= 300 && status < 400) return { outcome: "redirected", detail: "3xx without a location header" };
  if (status === 429) return { outcome: "rate-limited" };
  if (status === 401 || status === 403) return { outcome: "blocked", detail: "bot-block or auth-required" };
  if (status >= 400 && status < 500) return { outcome: "dead" };
  return { outcome: "dead", detail: `server error ${status}` };
}

function resolveRedirect(location: string, base: string): string | null {
  try {
    return new URL(location, base).href;
  } catch {
    return null;
  }
}

async function request(
  url: string,
  method: "HEAD" | "GET",
  bounds: { timeoutMs: number; maxBytes: number; userAgent: string; fetchImpl: FetchLike },
): Promise<Response | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), bounds.timeoutMs);
  const headers: Record<string, string> = { "user-agent": bounds.userAgent };
  if (method === "GET") headers.range = `bytes=0-${bounds.maxBytes - 1}`;
  try {
    const response = await bounds.fetchImpl(url, { method, headers, signal: controller.signal, redirect: "manual" });
    lastNetworkError = "network";
    return response;
  } catch (error) {
    lastNetworkError = isAbort(error) ? "timeout" : "network";
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** Reads at most maxBytes of the body so a huge response cannot be drained, then releases it. */
async function drainBounded(response: Response, maxBytes: number): Promise<void> {
  if (response.body === null) return;
  try {
    const reader = response.body.getReader();
    let received = 0;
    while (received < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
    }
    await reader.cancel();
  } catch {
    // the status line already decided the outcome; a body that errors mid-read changes nothing
  }
}

function blockedResult(url: string, method: "HEAD" | "GET", target: string, detail: string): LinkCheckResult {
  return { url, outcome: "blocked", method: method === "HEAD" ? "head" : "get-fallback", finalUrl: target, detail };
}

function describeRefusal(verdict: PolicyVerdict): string {
  switch (verdict.reason) {
    case "private-destination":
      return `refuses redirect into private destination`;
    case "credentials-in-url":
      return "refuses redirect into credential-bearing URL";
    case "not-http(s)":
      return "refuses redirect to non-http(s) scheme";
    default:
      return "refuses redirect to invalid URL";
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  const bare = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (bare.includes(":")) return isPrivateIpv6(bare);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(bare)) return isPrivateIpv4(bare);
  // Numeric spellings that a resolver still reads as an address (http://2130706433/, http://127.1/,
  // 0x7f.0.0.1) are exactly the loopback-alias tricks the guard exists for: refuse them all.
  if (/^[\d.]+$/.test(bare) || /^0x[0-9a-f]*(\.[0-9a-f]*)*$/i.test(bare)) return true;
  return false;
}

function isPrivateIpv4(host: string): boolean {
  const octets = host.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) return false;
  const [a, b] = octets as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const normalized = host.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(normalized);
  if (mapped !== null) return isPrivateIpv4(mapped[1]);
  const first = normalized.split(":")[0];
  const hextet = first === "" ? 0 : Number.parseInt(first, 16);
  if (Number.isNaN(hextet)) return false;
  // fc00::/7 unique-local, fe80::/10 link-local
  return (hextet & 0xfe00) === 0xfc00 || (hextet & 0xffc0) === 0xfe80;
}
