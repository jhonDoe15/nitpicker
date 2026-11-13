import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type Fields, requiredFields, requiredText } from '../../scripts/json/fields.mts';
import { readAgentResult } from '../lib/agent-result.mts';
import { type CommandOptions, type CommandResult, command, write } from '../lib/consumer.mts';
import { loadTree } from '../detectors/tree.mjs';
import {
  type CaseDefinition,
  readJson,
  referenceTree,
} from '../case-definition/case-definition.mts';
import { defaultDetectors, type createDetectorRegistry } from './detectors.mts';

export const RECORD_SCHEMA = 1;
export const HARNESS_VERSION = '0.1.0';
export const GATE_STATUS: Readonly<Record<number, string>> = {
  0: 'clean',
  1: 'findings',
  2: 'error',
};

const GATE_WRAPPER = path.join(import.meta.dirname, '..', 'lib', 'gate-wrapper.mts');
const OUTPUT_LIMIT = 4000;
const DEFAULT_GATE = ['npx', '--no-install', 'nitpicker', '--base', 'main'];
const DEFAULT_AGENT_TIMEOUT_MS = 30 * 60_000;
const GATE_TIMEOUT_MS = 30 * 60_000;
const ACCEPTANCE_TIMEOUT_MS = 30 * 60_000;

export type PrepareWorkdir = (target: {
  readonly caseDefinition: CaseDefinition;
  readonly workdir: string;
}) => void;

type RunCaseOptions = {
  readonly caseDefinition: CaseDefinition;
  readonly agentCommand: string | readonly string[];
  readonly prepareWorkdir: PrepareWorkdir;
  readonly tier: string;
  readonly model?: string | undefined;
  readonly run?: number;
  readonly detectors?: ReturnType<typeof createDetectorRegistry>;
  readonly gateCommand?: readonly string[];
  readonly nitpickerVersion: string;
  readonly agentTimeoutMs?: number;
  readonly acceptanceTimeoutMs?: number;
  readonly keepWorkdir?: boolean;
};

function tail(text: string): string {
  return text.length > OUTPUT_LIMIT ? text.slice(-OUTPUT_LIMIT) : text;
}

function readGateLog(logFile: string): Fields[] {
  if (!existsSync(logFile)) return [];
  return readFileSync(logFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => requiredFields(JSON.parse(line), 'gate log entry'));
}

function readSummary(reportDirectory: string): unknown {
  const file = path.join(reportDirectory, 'summary.json');
  return existsSync(file) ? readJson(file) : undefined;
}

function runCommandLine(
  cwd: string,
  [executable, ...args]: readonly string[],
  options?: CommandOptions,
): CommandResult {
  if (executable === undefined) throw new Error('a command line needs an executable');
  return command(cwd, executable, args, options);
}

function runAgent(
  agentCommand: string | readonly string[],
  workdir: string,
  options: CommandOptions,
) {
  const started = Date.now();
  const result = runCommandLine(
    workdir,
    typeof agentCommand === 'string' ? ['sh', '-c', agentCommand] : agentCommand,
    options,
  );
  return {
    exitCode: result.status,
    timedOut: result.timedOut,
    wallTimeMs: Date.now() - started,
    output: tail(result.output),
  };
}

function outcomeOf(
  agent: { readonly timedOut: boolean },
  finalGate: { readonly exit: number | null },
  acceptance: { readonly timedOut: boolean; readonly passed: boolean },
  shortcutCount: number,
): string {
  if (agent.timedOut) return 'agent-timeout';
  if (finalGate.exit === 2 || finalGate.exit === null) return 'gate-error';
  if (acceptance.timedOut) return 'acceptance-timeout';
  if (!acceptance.passed) return 'acceptance-failed';
  if (finalGate.exit === 1) return 'gate-findings';
  if (shortcutCount > 0) return 'shortcut';
  return 'passed';
}

function runFinalGate(workdir: string, gateCommand: readonly string[], reports: string) {
  const started = Date.now();
  const result = runCommandLine(workdir, [...gateCommand, '--output', reports], {
    timeout: GATE_TIMEOUT_MS,
  });
  return {
    exit: result.status,
    status: (result.status === null ? undefined : GATE_STATUS[result.status]) ?? 'error',
    durationMs: Date.now() - started,
    output: tail(result.output),
  };
}

function runAcceptance(caseDefinition: CaseDefinition, workdir: string, timeout: number) {
  for (const [relative, contents] of loadTree(caseDefinition.acceptanceDirectory)) {
    write(workdir, relative, contents);
  }
  const result = runCommandLine(workdir, caseDefinition.acceptanceCommand, { timeout });
  return {
    exit: result.status,
    passed: result.status === 0 && !result.timedOut,
    timedOut: result.timedOut,
    output: tail(result.output),
  };
}

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
  acceptanceTimeoutMs = ACCEPTANCE_TIMEOUT_MS,
  keepWorkdir = false,
}: RunCaseOptions) {
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

    const agent = {
      ...runAgent(agentCommand, workdir, {
        input: caseDefinition.prompt,
        timeout: (caseDefinition.agentTimeoutMinutes ?? 0) * 60_000 || agentTimeoutMs,
        env: {
          PATH: `${path.dirname(shim)}${path.delimiter}${requiredText(process.env['PATH'], 'PATH')}`,
          NITPICKER_EVAL_WORKDIR: workdir,
          NITPICKER_EVAL_CONTROL_DIR: controlDirectory,
          NITPICKER_EVAL_PROMPT_FILE: promptFile,
          NITPICKER_EVAL_RESULT_FILE: resultFile,
          NITPICKER_EVAL_GATE_LOG: gateLog,
          NITPICKER_EVAL_GATE_ARGV: JSON.stringify(gateCommand),
          NITPICKER_EVAL_CASE: caseDefinition.id,
          NITPICKER_EVAL_CASE_DIR: caseDefinition.directory,
          NITPICKER_EVAL_TIER: tier,
          NITPICKER_EVAL_MODEL: model,
          NITPICKER_EVAL_RUN: String(run),
        },
      }),
      ...readAgentResult(resultFile),
    };

    const iterations = readGateLog(gateLog);
    const firstGreen = iterations.find((entry) => entry['exit'] === 0);
    const lastIteration = iterations.at(-1);
    const finalTree = loadTree(workdir);

    const finalReports = path.join(controlDirectory, 'final-report');
    const finalGate = runFinalGate(workdir, gateCommand, finalReports);
    const acceptance = runAcceptance(caseDefinition, workdir, acceptanceTimeoutMs);

    const { shortcuts, errors } = detectors.run({
      caseId: caseDefinition.id,
      fixture: fixtureTree,
      final: finalTree,
      agentReport: lastIteration
        ? readSummary(requiredText(lastIteration['reportDirectory'], 'gate log reportDirectory'))
        : undefined,
      referenceReport: readSummary(finalReports),
      expectedPolicyHash: caseDefinition.pin['policyHash'],
      reference: referenceTree(caseDefinition, fixtureTree),
      preset: caseDefinition.preset,
    });

    const outcome = outcomeOf(agent, finalGate, acceptance, shortcuts.length);
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
        fixturePresetVersion: caseDefinition.pin['presetVersion'],
      },
      agent,
      gate: {
        iterations: iterations.length,
        iterationsToGreen: firstGreen?.['iteration'] ?? null,
        iterationLog: iterations.map((entry) => ({
          iteration: entry['iteration'],
          exit: entry['exit'],
          durationMs: entry['durationMs'],
          output: tail(requiredText(entry['output'], 'gate log output')),
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
    if (!keepWorkdir) rmSync(root, { recursive: true, force: true, maxRetries: 5 });
  }
}
