import { expect, test } from "vitest";
import {
  DISCLAIMER,
  formatPhaseLine,
  formatReport,
  overallExitCode,
  planPhases,
  resultFor,
  summarize,
  type PhaseResult,
} from "./drogaPrepublish";

// ---- phase planning -----------------------------------------------------------

test("the default plan runs every offline phase and leaves the network phase skipped", () => {
  const plan = planPhases({ buildRoot: "dist", skipBuild: false, liveLinks: false });
  expect(plan.map((p) => p.name)).toEqual([
    "check",
    "test",
    "build",
    "post-links",
    "routes",
    "media",
    "links-inventory",
    "links-live",
  ]);
  const live = plan.find((p) => p.name === "links-live");
  expect(live?.gating).toBe("flag");
  expect(live?.skipReason).toContain("--live-links");
  for (const phase of plan.filter((p) => p.name !== "links-live")) {
    expect(phase.skipReason).toBeUndefined();
  }
});

test("the live phase is planned without a skip reason only when its flag is given", () => {
  const plan = planPhases({ buildRoot: "dist", skipBuild: false, liveLinks: true });
  expect(plan.find((p) => p.name === "links-live")?.skipReason).toBeUndefined();
});

test("--skip-build labels the build phase skipped and keeps the rest running", () => {
  const plan = planPhases({ buildRoot: "dist", skipBuild: true, liveLinks: false });
  const build = plan.find((p) => p.name === "build");
  expect(build?.skipReason).toContain("--skip-build");
  expect(
    plan.filter((p) => p.name !== "build" && p.name !== "links-live").map((p) => p.skipReason),
  ).toEqual(Array<undefined>(6).fill(undefined));
});

test("a custom build root reaches the route and media phases and disables the build phase", () => {
  const plan = planPhases({ buildRoot: "elsewhere/dist-fixture", skipBuild: false, liveLinks: false });
  expect(plan.find((p) => p.name === "routes")?.command).toContain("elsewhere/dist-fixture");
  expect(plan.find((p) => p.name === "media")?.command).toContain("elsewhere/dist-fixture");
  const build = plan.find((p) => p.name === "build");
  expect(build?.skipReason).toContain("elsewhere/dist-fixture");
});

// ---- phase results and aggregation --------------------------------------------

test("exit code 0 passes, non-zero and crashed (null) phases fail", () => {
  expect(resultFor(planPhases({ buildRoot: "dist", skipBuild: false, liveLinks: false })[0], 0, 12).status).toBe("pass");
  expect(resultFor(planPhases({ buildRoot: "dist", skipBuild: false, liveLinks: false })[0], 1, 12).status).toBe("fail");
  expect(resultFor(planPhases({ buildRoot: "dist", skipBuild: false, liveLinks: false })[0], null, 12).status).toBe("fail");
});

function resultsOf(statuses: Array<PhaseResult["status"]>): PhaseResult[] {
  const template = planPhases({ buildRoot: "dist", skipBuild: false, liveLinks: false }).slice(0, statuses.length);
  return template.map((spec, i) => ({ name: spec.name, command: spec.command, status: statuses[i], exitCode: statuses[i] === "fail" ? 1 : statuses[i] === "pass" ? 0 : null, durationMs: 1 }));
}

test("the summary counts pass, fail and skip separately", () => {
  expect(summarize(resultsOf(["pass", "pass", "fail", "skip"]))).toEqual({ passed: 2, failed: 1, skipped: 1 });
});

test("any failed phase fails the run; skipped phases alone do not", () => {
  expect(overallExitCode(resultsOf(["pass", "pass", "pass"]))).toBe(0);
  expect(overallExitCode(resultsOf(["pass", "fail", "skip"]))).toBe(1);
  expect(overallExitCode(resultsOf(["skip", "skip"]))).toBe(0);
  expect(overallExitCode([])).toBe(0);
});

// ---- reporting ----------------------------------------------------------------

test("a skipped network phase is labelled SKIPPED with its reason, a failure is labelled FAIL", () => {
  const plan = planPhases({ buildRoot: "dist", skipBuild: false, liveLinks: false });
  const results = plan.map((spec) =>
    spec.skipReason === undefined
      ? { name: spec.name, command: spec.command, status: "pass" as const, exitCode: 0, durationMs: 2 }
      : { name: spec.name, command: spec.command, status: "skip" as const, exitCode: null, durationMs: null, note: spec.skipReason },
  );
  const liveLine = formatPhaseLine(results[results.length - 1], results.length, results.length);
  expect(liveLine).toContain("SKIPPED");
  expect(liveLine).toContain("--live-links");

  const failed = { ...results[2], status: "fail" as const, exitCode: 1, durationMs: 3 };
  expect(formatPhaseLine(failed, 3, results.length)).toContain("FAIL");
});

test("the report names the build root, every phase, the summary and the disclaimer", () => {
  const plan = planPhases({ buildRoot: "dist", skipBuild: false, liveLinks: false });
  const results: PhaseResult[] = plan.map((spec) =>
    spec.name === "links-live"
      ? { name: spec.name, command: spec.command, status: "skip", exitCode: null, durationMs: null, note: spec.skipReason }
      : { name: spec.name, command: spec.command, status: "pass", exitCode: 0, durationMs: 5 },
  );
  const text = formatReport({
    tool: "droga-prepublish",
    generatedAt: "2026-10-20T22:00:00.000Z",
    buildRoot: "dist",
    phases: results,
    summary: summarize(results),
    exitCode: overallExitCode(results),
  });
  expect(text).toContain("build root: dist");
  for (const spec of plan) expect(text).toContain(spec.name);
  expect(text).toContain("7 passed, 0 failed, 1 skipped");
  expect(text).toContain(DISCLAIMER);
});
