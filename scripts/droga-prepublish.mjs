// One offline prepublication command for Droga: the existing pnpm validation commands and
// this chain's own offline checkers in one documented sequence, each phase reported,
// the failing phase's status preserved in the overall exit code.
//
// Phases: pnpm check, pnpm test, pnpm build, node scripts/test-post-links.mjs,
// the route checker and the media/export audit over the build root, and the offline
// external-link inventory. The only network phase (external-link live recheck) runs
// exclusively with --live-links; without it the phase is reported as SKIPPED.
//
// Usage:
//   node scripts/droga-prepublish.mjs [--build-root DIR] [--skip-build] [--live-links] [--json FILE]
//
//   --build-root DIR  tree the route/media phases audit (default: dist)
//   --skip-build      reuse the existing build root instead of running pnpm build
//   --live-links      also fetch the public external links (bounded, polite; dead fails,
//                     blocked/rate-limited/unknown stay visible findings)
//   --json FILE       machine-readable report next to the human output
//
// Exit status: 0 all executed phases passed, 1 at least one phase failed, 2 usage error.
// This command verifies routes, media and build mechanics — never prose, facts or
// editorial fitness; a passing run does not make the site ready to publish.
//
// The wrapper never invokes itself; it only calls the pnpm commands above and the
// checker scripts in this directory.
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DISCLAIMER,
  formatPhaseLine,
  formatReport,
  overallExitCode,
  planPhases,
  resultFor,
  skippedResult,
  summarize,
} from "../src/lib/drogaPrepublish.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const USAGE = `usage: node scripts/droga-prepublish.mjs [--build-root DIR] [--skip-build] [--live-links] [--json FILE]`;

function readFlags(argv) {
  const flags = { buildRoot: "dist", skipBuild: false, liveLinks: false, json: undefined };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--build-root") flags.buildRoot = argv[++i];
    else if (argv[i] === "--skip-build") flags.skipBuild = true;
    else if (argv[i] === "--live-links") flags.liveLinks = true;
    else if (argv[i] === "--json") flags.json = argv[++i];
    else if (argv[i] === "--help" || argv[i] === "-h") {
      console.log(USAGE);
      console.log(DISCLAIMER);
      process.exit(0);
    } else {
      console.error(`unknown argument: ${argv[i]}\n${USAGE}`);
      process.exit(2);
    }
  }
  return flags;
}

const flags = readFlags(process.argv.slice(2));
const plan = planPhases(flags);
const buildPlanned = plan.find((phase) => phase.name === "build")?.skipReason === undefined;
// the checkers resolve the build root against the repo root (their cwd), so the wrapper must too
const buildRootPath = resolve(repoRoot, flags.buildRoot);

if (!buildPlanned && !existsSync(buildRootPath)) {
  console.error(`build root "${flags.buildRoot}" not found; run pnpm build first or drop --skip-build`);
  process.exit(2);
}

const results = [];
console.log(`droga-prepublish — offline prepublication checks (build root: ${flags.buildRoot})\n`);
for (const spec of plan) {
  if (spec.skipReason !== undefined) {
    const skipped = skippedResult(spec);
    results.push(skipped);
    console.log(formatPhaseLine(skipped, results.length, plan.length));
    continue;
  }
  const executable = spec.command[0] === "node" ? process.execPath : spec.command[0];
  const startedAt = performance.now();
  const run = spawnSync(executable, spec.command.slice(1), { cwd: repoRoot, stdio: "inherit" });
  const result = resultFor(spec, run.error !== undefined ? null : run.status, Math.round(performance.now() - startedAt));
  results.push(result);
  console.log(formatPhaseLine(result, results.length, plan.length));
}
if (buildPlanned && !existsSync(buildRootPath)) {
  console.error(`build phase passed but the build root "${flags.buildRoot}" is still missing; aborting`);
  process.exit(1);
}

const report = {
  tool: "droga-prepublish",
  generatedAt: new Date().toISOString(),
  buildRoot: flags.buildRoot,
  phases: results,
  summary: summarize(results),
  exitCode: overallExitCode(results),
  disclaimer: DISCLAIMER,
};
console.log(`\n${formatReport(report).split("\n").slice(-4).join("\n")}`);
if (flags.json !== undefined) {
  writeFileSync(flags.json, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`json report: ${flags.json}`);
}
process.exit(report.exitCode);
