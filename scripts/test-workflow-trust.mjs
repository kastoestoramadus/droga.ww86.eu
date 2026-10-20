// Static trust and permission checks for .github/workflows/deploy.yml, run by CI in job `build`.
// Two kinds of checks, deliberately separate:
//   - executable fixtures: the job/step `if:` conditions from the YAML are EVALUATED against
//     simulated GitHub events (same-repo PR, fork PR, Dependabot, close, push), so the fork /
//     Dependabot / close gating is proven, not grepped;
//   - structural assertions on the PARSED workflow (no raw-string grep of the file): triggers,
//     permissions, trusted checkout refs, what the write jobs may execute, artifact wiring.
// The YAML reader below understands only the subset this workflow is written in and throws on
// anything else, so a syntax drift fails loudly instead of mis-parsing.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflowPath = new URL("../.github/workflows/deploy.yml", import.meta.url);

// --- YAML subset reader: nested maps, sequences of maps/scalars, quoted/plain scalars, '|' block scalars, [flow sequences] ---

function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === "'" || c === '"') quote = c;
    else if (c === "#" && (i === 0 || line[i - 1] === " ")) return line.slice(0, i);
  }
  return line;
}

function scalar(text, n) {
  if (text === "|") return { block: true };
  if (text.startsWith("[") && text.endsWith("]")) {
    const inner = text.slice(1, -1).trim();
    return inner ? inner.split(",").map((s) => scalar(s.trim(), n)) : [];
  }
  if (text.startsWith("'") && text.endsWith("'") && text.length >= 2) return text.slice(1, -1).replaceAll("''", "'");
  if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) return JSON.parse(text);
  assert.ok(!/[:#]/.test(text), `line ${n}: quote scalars containing ':' or '#': ${text}`);
  return text;
}

function parseLines(text) {
  const lines = [];
  text.split("\n").forEach((raw, i) => {
    const no = stripComment(raw.replace(/\t/g, "  "));
    if (no.trim() && no.trim() !== "---") lines.push({ indent: no.match(/^ */)[0].length, text: no.trim(), n: i + 1 });
  });
  return lines;
}

function parseBlock(lines, pos, indent) {
  if (lines[pos].text === "-" || lines[pos].text.startsWith("- ")) {
    const items = [];
    while (pos < lines.length && lines[pos].indent === indent && (lines[pos].text === "-" || lines[pos].text.startsWith("- "))) {
      const rest = lines[pos].text === "-" ? "" : lines[pos].text.slice(2);
      const item = [];
      if (rest) item.push({ indent: indent + 2, text: rest, n: lines[pos].n });
      pos++;
      while (pos < lines.length && lines[pos].indent > indent) item.push(lines[pos++]);
      assert.ok(rest, `line ${lines[pos - 1].n}: bare '-' items are not used by this workflow`);
      items.push(parseBlock(item, 0, indent + 2)[0]);
    }
    return [items, pos];
  }
  const map = {};
  while (pos < lines.length && lines[pos].indent === indent) {
    const m = lines[pos].text.match(/^([^:#]+?):(?:\s+(.*))?$/);
    assert.ok(m, `line ${lines[pos].n}: expected 'key: value', got: ${lines[pos].text}`);
    const [, key, valueText] = m;
    assert.ok(!(key in map), `line ${lines[pos].n}: duplicate key '${key}'`);
    pos++;
    if (valueText === undefined) {
      const child = [];
      while (pos < lines.length && lines[pos].indent > indent) child.push(lines[pos++]);
      map[key] = child.length ? parseBlock(child, 0, child[0].indent)[0] : null; // 'key:' with nothing = null
    } else {
      const value = scalar(valueText, lines[pos - 1].n);
      if (value && value.block) {
        const body = [];
        while (pos < lines.length && lines[pos].indent > indent) body.push(lines[pos++]);
        map[key] = body.map((l) => " ".repeat(l.indent - indent - 2) + l.text).join("\n");
      } else map[key] = value;
    }
    assert.ok(!(lines[pos] && lines[pos].indent > indent), `line ${lines[pos]?.n}: inconsistent indentation under '${key}'`);
  }
  return [map, pos];
}

const allLines = parseLines(readFileSync(workflowPath, "utf8"));
const [workflow, consumed] = parseBlock(allLines, 0, 0);
assert.equal(consumed, allLines.length, "the whole workflow file was parsed, nothing silently dropped");

// --- GitHub expression evaluator: property paths from `github`, literals, ==, !=, !, &&, ||, parentheses ---

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " ") { i++; continue; }
    if (c === "'" || c === '"') {
      const end = src.indexOf(c, i + 1);
      assert.ok(end > 0, `unterminated string in: ${src}`);
      tokens.push({ t: "str", v: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const word = src.slice(i).match(/^[A-Za-z_][\w.]*/)[0];
      tokens.push({ t: "ident", v: word });
      i += word.length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (["==", "!=", "&&", "||"].includes(two)) { tokens.push({ t: two }); i += 2; continue; }
    if ("!()".includes(c)) { tokens.push({ t: c }); i++; continue; }
    throw new Error(`unsupported expression syntax '${c}' in: ${src}`);
  }
  return tokens;
}

function resolvePath(path, github) {
  if (path === "true") return true;
  if (path === "false") return false;
  if (path === "null") return null;
  if (!path.startsWith("github.")) throw new Error(`only github.* is reachable, got: ${path}`);
  return path.split(".").slice(1).reduce((obj, key) => (obj == null ? null : obj[key]), github);
}

function evaluate(ifSrc, github) {
  const src = ifSrc.replaceAll("${{", "").replaceAll("}}", "").trim();
  const tokens = tokenize(src);
  let pos = 0;
  const peek = () => tokens[pos];
  function primary() {
    const tok = tokens[pos++];
    if (tok.t === "(") { const v = or(); assert.ok(tokens[pos]?.t === ")"); pos++; return v; }
    if (tok.t === "!") return !primary();
    if (tok.t === "str") return tok.v;
    if (tok.t === "ident") return resolvePath(tok.v, github);
    throw new Error(`unexpected token '${tok.t}' in: ${src}`);
  }
  function comparison() {
    let left = primary();
    while (peek() && (peek().t === "==" || peek().t === "!=")) {
      const op = tokens[pos++].t;
      const right = primary();
      const eq = left === right || (left == null && right == null);
      left = op === "==" ? eq : !eq;
    }
    return left;
  }
  function and() {
    let v = comparison();
    while (peek() && peek().t === "&&") { pos++; const r = comparison(); v = v && r; }
    return v;
  }
  function or() {
    let v = and();
    while (peek() && peek().t === "||") { pos++; const r = and(); v = v || r; }
    return v;
  }
  const value = or();
  assert.ok(pos === tokens.length, `trailing tokens in: ${src}`);
  return value;
}

// --- simulated events ---

const pushMaster = {
  event_name: "push", ref: "refs/heads/master", sha: "aaaa1111",
  repository: { default_branch: "gh-pages" }, event: {},
};
const dispatchMaster = { ...pushMaster, event_name: "workflow_dispatch" };
function pr({ action = "opened", fork = false, login = "somebody", number = 9 } = {}) {
  return {
    event_name: "pull_request", ref: "refs/pull/9/merge", sha: "bbbb2222",
    repository: { default_branch: "gh-pages" },
    event: { action, pull_request: { number, head: { repo: { fork } }, user: { login } } },
  };
}
const fixtures = {
  pushMaster, dispatchMaster,
  prOpened: pr(), prSynchronize: pr({ action: "synchronize" }), prReopened: pr({ action: "reopened" }),
  prClosed: pr({ action: "closed" }),
  prForkOpened: pr({ fork: true }), prForkClosed: pr({ action: "closed", fork: true }),
  prDependabotOpened: pr({ login: "dependabot[bot]" }),
  prDependabotClosed: pr({ action: "closed", login: "dependabot[bot]" }),
};

const jobs = workflow.jobs;
const jobIf = (job) => job.if ?? "${{ true }}";

// --- executable fixtures: which job runs on which event ---

const jobOrder = ["build", "publish", "preview-publish", "preview-remove"];
const expectedRuns = {
  //                  build  publish  preview-publish  preview-remove
  pushMaster:         [true,  true,   false,           false],
  dispatchMaster:     [true,  true,   false,           false],
  prOpened:           [true,  false,  true,            false],
  prSynchronize:      [true,  false,  true,            false],
  prReopened:         [true,  false,  true,            false],
  prClosed:           [false, false,  false,           true],
  prForkOpened:       [true,  false,  false,           false],
  prForkClosed:       [false, false,  false,           false],
  prDependabotOpened: [true,  false,  false,           false],
  prDependabotClosed: [false, false,  false,           false],
};
for (const [name, runs] of Object.entries(expectedRuns)) {
  for (const [i, jobName] of jobOrder.entries()) {
    assert.ok(jobs[jobName], `job ${jobName} exists`);
    assert.equal(
      !!evaluate(jobIf(jobs[jobName]), fixtures[name]),
      runs[i],
      `${jobName} on ${name}: expected ${runs[i]}`,
    );
  }
}

// and the build-internal split: production vs preview artefact, per event
const buildSteps = Object.fromEntries(jobs.build.steps.map((s) => [s.name ?? s.run, s]));
function stepRuns(stepName, event) {
  const step = buildSteps[stepName];
  assert.ok(step, `build has a step '${stepName}'`);
  return !!evaluate(step.if ?? "${{ true }}", fixtures[event]);
}
for (const stepName of ["Build the site to publish"]) {
  assert.equal(stepRuns(stepName, "pushMaster"), true, `${stepName} on push`);
  assert.equal(stepRuns(stepName, "prOpened"), false, `${stepName} on a PR`);
}
for (const stepName of ["Build the PR preview under its own prefix", "Check the preview contract under the prefix", "Upload the PR preview"]) {
  assert.equal(stepRuns(stepName, "pushMaster"), false, `${stepName} on push`);
  assert.equal(stepRuns(stepName, "prOpened"), true, `${stepName} on a PR`);
  assert.equal(stepRuns(stepName, "prClosed"), true, `${stepName} on a closed PR (build itself is skipped)`);
}

// --- structural assertions on the parsed workflow ---

const on = workflow.on;
assert.deepEqual(Object.keys(on).sort(), ["pull_request", "push", "workflow_dispatch"], "triggers");
assert.ok(!("pull_request_target" in on), "pull_request_target must never be used");
assert.ok(Array.isArray(on.pull_request?.types), "pull_request trigger declares its types (closed = cleanup)");
for (const t of ["opened", "synchronize", "reopened", "closed"]) {
  assert.ok(on.pull_request.types.includes(t), `pull_request trigger includes ${t}`);
}

assert.deepEqual(workflow.permissions, { contents: "read" }, "workflow-level permissions are read-only");

const writeJobs = jobOrder.filter((n) => jobs[n].permissions?.contents === "write");
assert.deepEqual(writeJobs.sort(), ["preview-publish", "preview-remove", "publish"], "exactly these jobs carry contents: write");
assert.notEqual(jobs.build.permissions?.contents, "write", "the job that runs PR code stays read-only");
assert.deepEqual([jobs["preview-publish"].needs].flat(), ["build"], "a preview is published only from the verified build");

for (const name of writeJobs) {
  const job = jobs[name];
  const checkouts = job.steps.filter((s) => typeof s.uses === "string" && s.uses.startsWith("actions/checkout"));
  assert.ok(checkouts.length >= 1, `${name} checks out something`);
  for (const step of checkouts) {
    const ref = step.with?.ref;
    assert.ok(
      ref === "master" || ref === "gh-pages" || ref === undefined,
      `${name}: checkout ref must be the literal master or gh-pages, not event data (the repo's default branch is gh-pages)`,
    );
    if (ref === "master") assert.ok([false, "false"].includes(step.with["persist-credentials"]), `${name}: the script checkout keeps no push credentials`);
  }
  const runsOnPR = Object.values(fixtures).some((g) => g.event_name === "pull_request" && evaluate(jobIf(job), g));
  if (runsOnPR) {
    assert.ok(checkouts.some((s) => s.with?.ref === "master"), `${name}: runs on PRs, so its scripts come from a literal master checkout`);
  }
  // a write job executes nothing but the trusted publisher; the artefact is an argument, never run
  for (const step of job.steps.filter((s) => s.run)) {
    const commands = step.run.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
    assert.ok(commands.length > 0, `${name}: run step is empty`);
    for (const line of commands) {
      assert.match(line, /^(src\/scripts\/publish-pages|PR_NUMBER=|SOURCE_SHA=)/, `${name} may only run the trusted publisher, got: ${line}`);
      assert.doesNotMatch(line, /\b(bash|sh|zsh|node|npx|python3?|ruby|perl|eval|source)\b/, `${name}: no interpreters, got: ${line}`);
      assert.doesNotMatch(line, /chmod|curl|wget|\bsecrets\./, `${name}: no executables, downloads or secrets, got: ${line}`);
    }
  }
  assert.ok(job.concurrency?.group, `${name} serialises its gh-pages writes`);
  assert.ok(job["timeout-minutes"], `${name} has a timeout`);
}
assert.equal(jobs.publish.concurrency.group, "pages-publish-master", "production publish keeps its own serialisation group");
assert.equal(
  jobs["preview-publish"].concurrency.group,
  jobs["preview-remove"].concurrency.group,
  "publish and remove of the same PR serialise against each other",
);
assert.match(jobs["preview-publish"].concurrency.group, /\$\{\{ github\.event\.pull_request\.number \}\}/, "preview group is per PR");

assert.ok(!JSON.stringify(workflow).includes("secrets."), "no secrets anywhere: GITHUB_TOKEN through Actions auth only");

// the preview base, the artifact name and the publish target all use the same PR number expression
const numberExpr = "${{ github.event.pull_request.number }}";
const previewBuildStep = jobs.build.steps.find((s) => s.name === "Build the PR preview under its own prefix");
assert.equal(previewBuildStep.env.SITE_BASE, `/preview/pr-${numberExpr}`, "preview build base is /preview/pr-<PR number>");
const upload = jobs.build.steps.find((s) => s.uses?.startsWith("actions/upload-artifact") && s.with?.name?.startsWith("preview-pr-"));
assert.equal(upload.with.name, `preview-pr-${numberExpr}`, "preview artifact is named per PR");
const download = jobs["preview-publish"].steps.find((s) => s.uses?.startsWith("actions/download-artifact"));
assert.equal(download.with.name, `preview-pr-${numberExpr}`, "the publish job downloads that same per-PR artifact");
assert.equal(download.with.path, "site", "the artifact lands in a fixed directory");
assert.match(jobs["preview-publish"].steps.at(-1).run, /publish-pages pages preview/, "publish mode is preview");
assert.match(jobs["preview-remove"].steps.at(-1).run, /publish-pages pages remove/, "remove mode is remove");
assert.equal(jobs["preview-publish"].steps.at(-1).env.PR_NUMBER, numberExpr, "the PR number reaches the script as an env var, not as interpolated shell text");
assert.equal(jobs["preview-remove"].steps.at(-1).env.PR_NUMBER, numberExpr, "same for cleanup");

console.log("workflow trust: triggers, permissions, trusted checkouts, fork/Dependabot/close gating and artifact wiring all hold");
