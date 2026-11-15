import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { untrackTemporaryPath } from '../../../core/tooling/temporary-files.mjs';
import { MUTATION_ANALYZER_NAME, PYTHON_ANALYZER_NAME } from './python-analyzer.mjs';
import { applyPythonExceptions, pythonRouteRule } from './configuration/python-exceptions.mts';
import { readPythonFindings } from './python-reports.mts';
import { ENVIRONMENT_FAILED_RULE } from './execution/environments/environment-error.mjs';
import {
  TESTS_FAILED_RULE,
  TESTS_FAILED_SKIPPED_RULE,
  TESTS_NOT_RUN_RULE,
} from '../../../shared/rules/finding-helpers.mjs';
import {
  TROUBLESHOOTING_ANCHORS,
  testsFailAnchor,
} from '../../../shared/messages/troubleshooting.mjs';
import { fieldOf, fieldsOf, parseJson, textOf } from '../../../shared/values/readers.mts';
import type { IngestedFinding } from './typed/report/report-types.mts';
import type {
  ParsedArguments,
  RunnerOptions,
  RunnerReport,
  ToolFailure,
} from './typed/runner/runner-types.mts';
import {
  analyzerDeadlineMs,
  applyFindingPolicy,
  applyRuleHints,
  createToolContext,
  mutationFindings,
  parseSharedArguments,
  readHeadPolicyFile,
  runPythonTools,
  trackTemporaryPath,
  withTroubleshooting,
} from './typed/runner/runner-views.mts';

const UNEXPECTED_FAILURE_RULES: Readonly<Record<string, string>> = {
  [PYTHON_ANALYZER_NAME]: 'python-failed',
  [MUTATION_ANALYZER_NAME]: 'mutation-failed',
};
const PYTHON_OPTIONS = ['--live-root', '--python-settings', '--part', '--baseline-moves-file'];

function toolError(
  { rule, message }: ToolFailure,
  part: string = PYTHON_ANALYZER_NAME,
): IngestedFinding {
  return {
    tool: part,
    rule,
    path: '.',
    identity: rule,
    message,
    classification: 'tool-error',
  };
}

const TEST_RULES = new Set([TESTS_FAILED_RULE, TESTS_FAILED_SKIPPED_RULE, TESTS_NOT_RUN_RULE]);

function fixAnchor({ rule }: IngestedFinding, part: string, snapshot: string | undefined): unknown {
  if (TEST_RULES.has(rule)) {
    return testsFailAnchor(snapshot);
  }
  if (rule === ENVIRONMENT_FAILED_RULE) {
    return TROUBLESHOOTING_ANCHORS.pythonEnvironment;
  }
  return part === MUTATION_ANALYZER_NAME
    ? TROUBLESHOOTING_ANCHORS.mutmutFails
    : TROUBLESHOOTING_ANCHORS.pythonToolFails;
}

function withFixLinks(
  findings: readonly IngestedFinding[],
  part: string,
  snapshot: string | undefined,
): IngestedFinding[] {
  return findings.map((finding) =>
    finding.classification === 'tool-error'
      ? {
          ...finding,
          message: withTroubleshooting(finding.message, fixAnchor(finding, part, snapshot)),
        }
      : finding,
  );
}

function toolContext(
  { projectRoot, liveRoot, settings, policy, spawn }: RunnerOptions,
  reportRoot: string,
): unknown {
  return createToolContext({
    spawn,
    projectRoot,
    liveRoot,
    settings: { ...settings, testSeconds: policy.testSeconds },
    reportRoot,
    exclude: policy.exclude,
    duplicateSkippedFolders: policy.duplicateSkippedFolders,
    snapshot: policy.snapshot,
    quick: policy.quick,
    baselineRoot: policy.baselineRoot,
    conventions: policy.conventions,
    layout: policy.layout,
    policyRoot: policy.policyRoot,
    toolPrecedence: policy.toolPrecedence,
    mutationScope: policy.mutationScope,
    pytestAddopts: process.env['PYTEST_ADDOPTS'],
    analyzerDeadlineMs: analyzerDeadlineMs(process.env),
  });
}

function withReportRoot<Result>(step: (reportRoot: string) => Result): Result {
  const reportRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-python-'));
  trackTemporaryPath(reportRoot);
  try {
    return step(reportRoot);
  } finally {
    rmSync(reportRoot, { recursive: true, force: true });
    untrackTemporaryPath(reportRoot);
  }
}

function collectMutationFindings(options: RunnerOptions): IngestedFinding[] {
  return withReportRoot((reportRoot: string) =>
    applyFindingPolicy(
      applyPythonExceptions(
        applyRuleHints(mutationFindings(toolContext(options, reportRoot))),
        options.settings.exceptions,
      ),
      {
        exclude: options.policy.exclude,
        exceptions: options.policy.exceptions,
        routeRule: pythonRouteRule,
      },
    ),
  );
}

function collectPythonFindings({
  projectRoot,
  liveRoot,
  settings,
  policy,
  spawn,
}: RunnerOptions): RunnerReport {
  return withReportRoot((reportRoot: string) => {
    const failures = runPythonTools(
      toolContext({ projectRoot, liveRoot, settings, policy, spawn }, reportRoot),
    );
    if (failures.length > 0) {
      return { findings: failures.map((failure) => toolError(failure)) };
    }
    const { findings, ...sections } = readPythonFindings({
      projectRoot,
      reportRoot,
      crapLimit: policy.crapLimit,
      policy,
      exceptions: settings.exceptions,
    });
    return {
      findings: applyFindingPolicy(applyPythonExceptions(findings, settings.exceptions), {
        ...policy,
        inventoryTool: PYTHON_ANALYZER_NAME,
        routeRule: pythonRouteRule,
      }),
      ...sections,
    };
  });
}

export function analyzePythonSnapshot({
  part = PYTHON_ANALYZER_NAME,
  ...options
}: RunnerOptions & { readonly part?: string }): RunnerReport {
  const snapshot = options.policy.snapshot;
  try {
    const report =
      part === MUTATION_ANALYZER_NAME
        ? { findings: collectMutationFindings(options) }
        : collectPythonFindings(options);
    return { ...report, findings: withFixLinks(report.findings, part, snapshot) };
  } catch (error) {
    return {
      findings: withFixLinks(
        [
          toolError(
            {
              rule: textOf(fieldOf(error, 'rule') ?? UNEXPECTED_FAILURE_RULES[part]),
              message: error instanceof Error ? error.message : String(error),
            },
            part,
          ),
        ],
        part,
        snapshot,
      ),
    };
  }
}

export function parsePythonArguments(argumentList: readonly string[]): ParsedArguments {
  const own = new Map<string, string | undefined>();
  const shared: string[] = [];
  const remaining = argumentList.values();
  for (const argument of remaining) {
    if (PYTHON_OPTIONS.includes(argument)) {
      const next = remaining.next();
      own.set(argument, next.done === true ? undefined : next.value);
    } else {
      shared.push(argument);
    }
  }
  const { projectRoot, policy } = parseSharedArguments(shared);
  const part = own.get('--part') ?? PYTHON_ANALYZER_NAME;
  if (!(part in UNEXPECTED_FAILURE_RULES)) {
    throw new Error(`--part must be one of: ${Object.keys(UNEXPECTED_FAILURE_RULES).join(', ')}`);
  }
  return {
    part,
    projectRoot,
    liveRoot: own.get('--live-root') ?? projectRoot,
    settings: fieldsOf(parseJson(own.get('--python-settings') ?? '{}')),
    policy: { ...policy, baselineMovesFile: own.get('--baseline-moves-file') },
  };
}

export function runPython(
  runnerArguments: readonly string[],
  { spawn }: { readonly spawn?: unknown } = {},
): RunnerReport {
  const { part, projectRoot, liveRoot, settings, policy } = parsePythonArguments(runnerArguments);
  const headPolicy = readHeadPolicyFile();
  const { conventions, layout, history } = headPolicy;
  return analyzePythonSnapshot({
    part,
    projectRoot: realpathSync(projectRoot),
    liveRoot: realpathSync(liveRoot),
    settings,
    policy: { ...policy, conventions, layout, history, headPolicy },
    spawn,
  });
}

function main(runnerArguments: readonly string[]): void {
  const report = runPython(runnerArguments);
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === import.meta.filename) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `Python differential adapter failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  }
}
