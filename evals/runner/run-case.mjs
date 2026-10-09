import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checked, command, createConsumer, write } from '../lib/consumer.mjs';
import { loadTree } from '../detectors/tree.mjs';
import { defaultDetectors } from './detectors.mjs';

export const RECORD_SCHEMA = 1;
export const HARNESS_VERSION = '0.1.0';
export const GATE_STATUS = { 0: 'clean', 1: 'findings', 2: 'error' };

const GATE_WRAPPER = path.join(import.meta.dirname, '..', 'lib', 'gate-wrapper.mjs');
const OUTPUT_LIMIT = 4000;
const DEFAULT_GATE = ['npx', '--no-install', 'nitpicker', '--base', 'main'];
const DEFAULT_AGENT_TIMEOUT_MS = 30 * 60_000;

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const tail = (text) => (text.length > OUTPUT_LIMIT ? text.slice(-OUTPUT_LIMIT) : text);

/**
 * A case is a directory: `case.json` (id, title, prompt, optional acceptance.command and
 * categories), `fixture.json` (presetVersion, optional policyHash), `fixture/` (a project that
 * passes the gate) and `acceptance/` (hidden test files, copied in only after the agent finishes).
 */
export function loadCase(caseDirectory) {
  const definition = readJson(path.join(caseDirectory, 'case.json'));
  const pin = existsSync(path.join(caseDirectory, 'fixture.json'))
    ? readJson(path.join(caseDirectory, 'fixture.json'))
    : {};
  return {
    ...definition,
    directory: caseDirectory,
    fixtureDirectory: path.join(caseDirectory, 'fixture'),
    acceptanceDirectory: path.join(caseDirectory, 'acceptance'),
    acceptanceCommand: definition.acceptance?.command ?? ['npx', '--no-install', 'vitest', 'run'],
    pin,
  };
}

export function listCases(casesDirectory) {
  return readdirSync(casesDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(casesDirectory, entry.name))
    .filter((directory) => existsSync(path.join(directory, 'case.json')))
    .sort()
    .map(loadCase);
}

/** E1: a preset release re-runs only the cases whose pinned preset version is behind it. */
export function isStale(caseDefinition, presetVersion) {
  return caseDefinition.pin.presetVersion !== presetVersion;
}

/** Default workdir setup: the fixture installed as a consumer of the packed tarball. */
export function installedWorkdir({ tarball, manifest }) {
  return ({ caseDefinition, workdir }) => {
    createConsumer({
      root: workdir,
      tarball,
      manifest,
      files: Object.fromEntries(loadTree(caseDefinition.fixtureDirectory)),
      packageJson: { devDependencies: caseDefinition.devDependencies },
    });
    checked(workdir, 'git', ['switch', '-c', 'feature']);
  };
}

/** Workdir setup without an install, for tests of the runner itself. */
export function copiedWorkdir() {
  return ({ caseDefinition, workdir }) => {
    checked(workdir, 'git', ['init', '-b', 'main']);
    for (const [relative, contents] of loadTree(caseDefinition.fixtureDirectory)) {
      write(workdir, relative, contents);
    }
    checked(workdir, 'git', ['add', '.']);
    commitFixture(workdir);
    checked(workdir, 'git', ['switch', '-c', 'feature']);
  };
}

// A fixed date makes the fixture commit identical for every run of a case, so the gate's findings
// cache (keyed by the merge-base commit) reuses the base-side analysis instead of redoing it.
const FIXTURE_COMMIT_DATE = '2026-01-01T00:00:00Z';

function commitFixture(workdir) {
  const result = command(
    workdir,
    'git',
    ['-c', 'user.name=Eval', '-c', 'user.email=eval@example.invalid', 'commit', '-m', 'fixture'],
    { env: { GIT_AUTHOR_DATE: FIXTURE_COMMIT_DATE, GIT_COMMITTER_DATE: FIXTURE_COMMIT_DATE } },
  );
  if (result.status !== 0) {
    throw new Error(`git commit exited ${result.status}\n${result.output}`);
  }
}

function readGateLog(logFile) {
  if (!existsSync(logFile)) return [];
  return readFileSync(logFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function readSummary(reportDirectory) {
  const file = path.join(reportDirectory, 'summary.json');
  return existsSync(file) ? readJson(file) : undefined;
}

function runAgent({ agentCommand, workdir, environment, prompt, timeoutMs }) {
  const started = Date.now();
  const [executable, args] =
    typeof agentCommand === 'string'
      ? ['sh', ['-c', agentCommand]]
      : [agentCommand[0], agentCommand.slice(1)];
  const result = command(workdir, executable, args, {
    env: environment,
    timeout: timeoutMs,
    input: prompt,
  });
  return {
    exitCode: result.status,
    timedOut: result.timedOut,
    wallTimeMs: Date.now() - started,
    output: tail(result.output),
  };
}

function readAgentResult(file) {
  if (!existsSync(file)) return {};
  try {
    const { costUsd, inputTokens, outputTokens, turns } = readJson(file);
    return { costUsd, inputTokens, outputTokens, turns };
  } catch {
    return {};
  }
}

function outcomeOf({ agent, finalGate, acceptancePassed, shortcuts }) {
  if (agent.timedOut) return 'agent-timeout';
  if (finalGate.exit === 2 || finalGate.exit === null) return 'gate-error';
  if (!acceptancePassed) return 'acceptance-failed';
  if (finalGate.exit === 1) return 'gate-findings';
  if (shortcuts.length > 0) return 'shortcut';
  return 'passed';
}

/**
 * Runs one case once and returns a run record (see RECORD_SCHEMA).
 *
 * The agent is any command: it runs in the workdir with the task prompt on stdin and in
 * NITPICKER_EVAL_PROMPT_FILE, learns its tier and model from NITPICKER_EVAL_TIER and
 * NITPICKER_EVAL_MODEL, runs the gate through `nitpicker-gate` (on PATH), and may write
 * `{ costUsd, inputTokens, outputTokens, turns }` to NITPICKER_EVAL_RESULT_FILE. The runner then
 * runs the gate itself, copies the hidden acceptance tests in, runs them, and runs the detectors.
 */
export function runCase({
  caseDefinition,
  agentCommand,
  prepareWorkdir,
  tier,
  model = tier,
  run = 1,
  detectors = defaultDetectors,
  gateCommand: baseGateCommand = DEFAULT_GATE,
  nitpickerVersion,
  agentTimeoutMs = DEFAULT_AGENT_TIMEOUT_MS,
  keepWorkdir = false,
}) {
  const startedAt = new Date();
  const gateCommand = [...baseGateCommand, ...(caseDefinition.gateArguments ?? [])];
  const root = mkdtempSync(path.join(tmpdir(), `nitpicker-eval-${caseDefinition.id}-`));
  const workdir = path.join(root, 'work');
  const controlDirectory = path.join(root, 'control');
  mkdirSync(workdir);
  mkdirSync(path.join(controlDirectory, 'bin'), { recursive: true });
  try {
    prepareWorkdir({ caseDefinition, workdir });
    const fixtureTree = loadTree(workdir);

    const gateLog = path.join(controlDirectory, 'gate-log.jsonl');
    const promptFile = path.join(controlDirectory, 'prompt.txt');
    const resultFile = path.join(controlDirectory, 'agent-result.json');
    const shim = path.join(controlDirectory, 'bin', 'nitpicker-gate');
    writeFileSync(promptFile, caseDefinition.prompt);
    writeFileSync(shim, `#!/bin/sh\nexec node ${JSON.stringify(GATE_WRAPPER)} "$@"\n`);
    chmodSync(shim, 0o755);

    const agent = runAgent({
      agentCommand,
      workdir,
      prompt: caseDefinition.prompt,
      timeoutMs: agentTimeoutMs,
      environment: {
        PATH: `${path.dirname(shim)}${path.delimiter}${process.env.PATH}`,
        NITPICKER_EVAL_WORKDIR: workdir,
        NITPICKER_EVAL_CONTROL_DIR: controlDirectory,
        NITPICKER_EVAL_PROMPT_FILE: promptFile,
        NITPICKER_EVAL_RESULT_FILE: resultFile,
        NITPICKER_EVAL_GATE_LOG: gateLog,
        NITPICKER_EVAL_GATE_ARGV: JSON.stringify(gateCommand),
        NITPICKER_EVAL_CASE: caseDefinition.id,
        NITPICKER_EVAL_TIER: tier,
        NITPICKER_EVAL_MODEL: model,
        NITPICKER_EVAL_RUN: String(run),
      },
    });
    Object.assign(agent, readAgentResult(resultFile));

    const iterations = readGateLog(gateLog);
    const firstGreen = iterations.find((entry) => entry.exit === 0);
    const finalTree = loadTree(workdir);

    const finalReports = path.join(controlDirectory, 'final-report');
    const gateStarted = Date.now();
    const [gateExecutable, ...gateArguments] = gateCommand;
    const gateResult = command(workdir, gateExecutable, [
      ...gateArguments,
      '--output',
      finalReports,
    ]);
    const finalGate = {
      exit: gateResult.status,
      status: GATE_STATUS[gateResult.status] ?? 'error',
      durationMs: Date.now() - gateStarted,
      output: tail(gateResult.output),
    };

    for (const [relative, contents] of loadTree(caseDefinition.acceptanceDirectory)) {
      write(workdir, relative, contents);
    }
    const [acceptanceExecutable, ...acceptanceArguments] = caseDefinition.acceptanceCommand;
    const acceptanceResult = command(workdir, acceptanceExecutable, acceptanceArguments);
    const acceptance = {
      exit: acceptanceResult.status,
      passed: acceptanceResult.status === 0,
      output: tail(acceptanceResult.output),
    };

    const { shortcuts, errors } = detectors.run({
      caseId: caseDefinition.id,
      fixture: fixtureTree,
      final: finalTree,
      agentReport: iterations.length ? readSummary(iterations.at(-1).reportDirectory) : undefined,
      referenceReport: readSummary(finalReports),
      expectedPolicyHash: caseDefinition.pin.policyHash,
    });

    const outcome = outcomeOf({
      agent,
      finalGate,
      acceptancePassed: acceptance.passed,
      shortcuts,
    });
    return {
      schema: RECORD_SCHEMA,
      caseId: caseDefinition.id,
      tier,
      model,
      run,
      startedAt: startedAt.toISOString(),
      wallTimeMs: Date.now() - startedAt.getTime(),
      versions: {
        harness: HARNESS_VERSION,
        nitpicker: nitpickerVersion,
        fixturePresetVersion: caseDefinition.pin.presetVersion,
      },
      agent,
      gate: {
        iterations: iterations.length,
        iterationsToGreen: firstGreen?.iteration ?? null,
        // The messages the agent saw, so wording regressions show up as more iterations.
        iterationLog: iterations.map(({ iteration, exit, durationMs, output }) => ({
          iteration,
          exit,
          durationMs,
          output: tail(output),
        })),
        final: finalGate,
      },
      acceptance,
      shortcuts,
      detectorErrors: errors,
      outcome,
      passed: outcome === 'passed',
      workdir: keepWorkdir ? workdir : undefined,
    };
  } finally {
    if (!keepWorkdir) rmSync(root, { recursive: true, force: true });
  }
}
