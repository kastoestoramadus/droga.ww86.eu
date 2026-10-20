// Pure planning and reporting logic for scripts/droga-prepublish.mjs: which offline phases
// run, how skipped phases are labelled and how phase outcomes combine into the wrapper's
// exit status. Nothing here spawns a process, reads the clock or touches the network or
// filesystem; the wrapper owns all of that.

export type PhaseStatus = "pass" | "fail" | "skip";

/** "always" phases run in every invocation; "flag" phases need their own CLI flag. */
export type PhaseGating = "always" | "flag";

export interface PhaseSpec {
  name: string;
  command: string[];
  gating: PhaseGating;
  /** present when the phase will not run in this invocation, with the reason shown to the user */
  skipReason?: string;
}

export interface PhaseResult {
  name: string;
  command: string[];
  status: PhaseStatus;
  /** null for skipped phases and for a process that could not be spawned or crashed */
  exitCode: number | null;
  durationMs: number | null;
  note?: string;
}

export interface PrepublishOptions {
  /** build tree the check phases audit (the build phase itself always writes dist/) */
  buildRoot: string;
  skipBuild: boolean;
  liveLinks: boolean;
}

export interface PrepublishSummary {
  passed: number;
  failed: number;
  skipped: number;
}

export interface PrepublishReport {
  tool: string;
  generatedAt: string;
  buildRoot: string;
  phases: PhaseResult[];
  summary: PrepublishSummary;
  exitCode: number;
}

export const DISCLAIMER =
  "Offline mechanics only: types, unit tests, build, post links, routes, media and export hygiene. " +
  "This does not verify prose, facts or editorial fitness, and a passing run does not make the site ready to publish.";

const LIVE_SKIP_REASON =
  "network phase: pass --live-links to fetch the public links (blocked/unknown stay visible findings, never fatal)";

/** The phase list of one invocation in execution order, with skip decisions already applied. */
export function planPhases(options: PrepublishOptions): PhaseSpec[] {
  const customRoot = options.buildRoot !== "dist";
  const buildSkip = options.skipBuild
    ? "reused the existing build root (--skip-build)"
    : customRoot
      ? `pnpm build writes dist/, not "${options.buildRoot}"; build phase disabled for this custom root`
      : undefined;
  return [
    { name: "check", command: ["pnpm", "check"], gating: "always" },
    { name: "test", command: ["pnpm", "test"], gating: "always" },
    { name: "build", command: ["pnpm", "build"], gating: "always", skipReason: buildSkip },
    { name: "post-links", command: ["node", "scripts/test-post-links.mjs"], gating: "always" },
    { name: "routes", command: ["node", "scripts/droga-check-routes.mjs", options.buildRoot], gating: "always" },
    { name: "media", command: ["node", "scripts/droga-check-media.mjs", "--dist", options.buildRoot], gating: "always" },
    { name: "links-inventory", command: ["node", "scripts/droga-check-external-links.mjs", "inventory"], gating: "always" },
    {
      name: "links-live",
      command: ["node", "scripts/droga-check-external-links.mjs", "live"],
      gating: "flag",
      skipReason: options.liveLinks ? undefined : LIVE_SKIP_REASON,
    },
  ];
}

/** A phase that ran: exit 0 passes, anything else (including a crash, exitCode null) fails. */
export function resultFor(spec: PhaseSpec, exitCode: number | null, durationMs: number): PhaseResult {
  const crashed = exitCode === null;
  return {
    name: spec.name,
    command: spec.command,
    status: exitCode === 0 ? "pass" : "fail",
    exitCode,
    durationMs,
    note: crashed ? "process could not be spawned or was killed" : undefined,
  };
}

/** A phase that did not run in this invocation, labelled with its reason. */
export function skippedResult(spec: PhaseSpec): PhaseResult {
  return {
    name: spec.name,
    command: spec.command,
    status: "skip",
    exitCode: null,
    durationMs: null,
    note: spec.skipReason ?? "not planned in this invocation",
  };
}

const SUMMARY_KEY: Record<PhaseStatus, keyof PrepublishSummary> = {
  pass: "passed",
  fail: "failed",
  skip: "skipped",
};

export function summarize(results: PhaseResult[]): PrepublishSummary {
  const summary = { passed: 0, failed: 0, skipped: 0 };
  for (const result of results) summary[SUMMARY_KEY[result.status]] += 1;
  return summary;
}

/** 0 when every planned phase passed (skips do not fail); 1 as soon as one phase failed. */
export function overallExitCode(results: PhaseResult[]): number {
  return results.some((result) => result.status === "fail") ? 1 : 0;
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return "—";
  return durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`;
}

const STATUS_LABEL: Record<PhaseStatus, string> = { pass: "PASS", fail: "FAIL", skip: "SKIPPED" };

export function formatPhaseLine(result: PhaseResult, index: number, total: number): string {
  const width = total.toString().length;
  const line = `[${index.toString().padStart(width)}/${total}] ${result.name.padEnd(15, ".")} ${STATUS_LABEL[result.status]} (${formatDuration(result.durationMs)})`;
  return result.note === undefined ? line : `${line}\n      skipped/failed: ${result.note}`;
}

export function formatReport(report: PrepublishReport): string {
  const lines = [
    `${report.tool} — offline prepublication checks`,
    `build root: ${report.buildRoot}`,
    `generated: ${report.generatedAt}`,
    "",
  ];
  report.phases.forEach((phase, i) => {
    lines.push(formatPhaseLine(phase, i + 1, report.phases.length));
  });
  lines.push(
    "",
    `summary: ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.skipped} skipped`,
    `exit status: ${report.exitCode}`,
    "",
    DISCLAIMER,
  );
  return lines.join("\n");
}
