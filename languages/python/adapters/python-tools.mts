import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { scanImports } from './analysis/python-coupling.mts';
import { scanTestStrings } from './analysis/test-runtime/python-test-runtime.mts';
import { collectFacts } from './facts/python-facts.mts';
import { scanDependencies } from './dependencies/dependency-findings.mts';
import { runDuplicates } from './analysis/python-duplicates.mts';
import { openSnapshotEnvironment } from './execution/python-environment.mts';
import { checkRules } from './analysis/python-ast-rules.mts';
import { pytestStyle, pytestStyleFlags } from '../rules/libraries/pytest-style.mts';
import { runImportLinter } from './analysis/python-import-linter.mts';
import { execute, failure, run } from './execution/python-process.mts';
import {
  detectFormatter,
  detectSourceRoots,
  detectTargetVersion,
  detectTypeCheckers,
  importRoots,
} from './execution/python-project.mts';
import { formatCommand, ruffExclusions } from './formatting/format-command.mts';
import { ruffLintConfig } from './project-tools/ruff/ruff-lint-config.mts';
import { detectTestRunner } from './execution/python-test-runner.mts';
import { test, TestRunError } from './test-runs/test-step.mts';
import { retimeSlowTests } from './test-runs/timing/slow-retime.mts';

import { typeCheck } from './python-types.mts';
import { structure } from './analysis/python-structure.mts';
import type { SpawnResult } from './execution/typed/process-types.mts';
import type { Launcher } from './typed/environment/launcher-types.mts';
import type { ToolFailure } from './typed/runner/runner-types.mts';
import { fieldOf } from '../../../shared/values/readers.mts';
import type {
  ToolContext,
  ToolContextOptions,
  ToolOutcome,
  ToolProject,
  ToolStep,
  ProjectSettingsOptions,
  LauncherOptions,
} from './typed/context/tool-context-types.mts';

export const RUFF_REPORT = 'ruff.sarif';
export const FORMAT_REPORT = 'format.txt';
export const MANIFEST_REPORT = 'manifest.json';
const BLACK = 'black';
const COVERAGE_DATA = '.coverage';
export const FORMAT_FAILURE_STATUS: Readonly<Record<string, number>> = { black: 123, ruff: 2 };
const PARSE_ERROR: Readonly<Record<string, RegExp>> = {
  black: /^error: cannot (?:format .+: cannot )?parse\b/i,
  ruff: /^error: Failed to parse /,
};

function projectSettings({
  projectRoot,
  liveRoot,
  policyRoot,
  settings,
  sourceRoots,
}: ProjectSettingsOptions): ToolProject {
  return {
    formatter: detectFormatter(policyRoot ?? projectRoot, settings['formatter']),
    formatterDetected: settings['formatter'] === undefined,
    typeCheckers: detectTypeCheckers(liveRoot, settings['typeChecker']),
    testRunner: detectTestRunner(projectRoot, settings['testRunner']),
    targetVersion: detectTargetVersion(projectRoot),
    importLinter: settings['importLinter'],
    sourceRoots,
    entryPoints: settings['entryPoints'] ?? [],
  };
}

function launcherFor({ projectRoot, liveRoot, settings, spawn }: LauncherOptions): Launcher {
  return openSnapshotEnvironment({
    projectRoot,
    liveRoot,
    setting: settings['environment'],
    spawn,
  });
}

function toolEnvironment({
  pythonPath,
  reportRoot,
}: {
  readonly pythonPath: string;
  readonly reportRoot: string | undefined;
}): Record<string, string> {
  return {
    PYTHONPATH: pythonPath,
    PYTHONDONTWRITEBYTECODE: '1',
    ...(reportRoot === undefined ? {} : { COVERAGE_FILE: path.join(reportRoot, COVERAGE_DATA) }),
  };
}

export function createToolContext({
  projectRoot,
  liveRoot,
  settings = {},
  reportRoot,
  exclude = [],
  duplicateSkippedFolders,
  snapshot = 'head',
  baselineRoot,
  conventions = {},
  layout = {},
  policyRoot,
  toolPrecedence,
  probes = new Map(),
  spawn,
  pytestAddopts,
  mutationScope,
  analyzerDeadlineMs,
  quick = false,
}: ToolContextOptions): ToolContext {
  const launcher = launcherFor({ projectRoot, liveRoot, settings, spawn });
  const sourceRoots = detectSourceRoots(projectRoot, settings['sourceRoots']);
  const pythonPath = [...importRoots(projectRoot, sourceRoots), process.env['PYTHONPATH']]
    .filter((entry) => entry !== undefined && entry !== '')
    .join(path.delimiter);
  return {
    projectRoot,
    reportRoot: reportRoot ?? '',
    snapshot,
    baselineRoot,
    testSeconds: settings['testSeconds'],
    conventions,
    layout,
    policyRoot,
    toolPrecedence,
    probes,
    spawn,
    launcher,
    exclude,
    duplicateSkippedFolders,
    pytestAddopts,
    mutationScope,
    analyzerDeadlineMs,
    quick: Boolean(quick),
    project: projectSettings({ projectRoot, liveRoot, policyRoot, settings, sourceRoots }),
    env: toolEnvironment({ pythonPath, reportRoot }),
  };
}

function failureRule(error: unknown): string {
  const rule = fieldOf(error, 'rule');
  return typeof rule === 'string' ? rule : 'python-failed';
}

export function runPythonTools(context: ToolContext): ToolFailure[] {
  let outcome: ToolOutcome = {};
  const steps: ToolStep[] = [
    lint,
    format,
    ...(context.quick
      ? []
      : [
          (stepContext: ToolContext) => {
            outcome = { ...outcome, ...test(stepContext) };
          },
          retimeSlowTests,
        ]),
    typeCheck,
    checkRules,
    structure,
    runDuplicates,
    (stepContext) => {
      scanImports(stepContext, run);
      scanTestStrings(stepContext, run);
      scanDependencies(stepContext, run);
    },
    (stepContext) => {
      collectFacts(stepContext, run);
    },
    (stepContext) => {
      runImportLinter(stepContext, run);
    },
  ];
  const failures = steps.flatMap((step) => {
    try {
      step(context, outcome);
      return [];
    } catch (error) {
      if (error instanceof TestRunError) {
        outcome = { ...outcome, ...error.outcome };
      }
      return [
        {
          rule: failureRule(error),
          message: error instanceof Error ? error.message : String(error),
        },
      ];
    }
  });
  writeFileSync(
    path.join(context.reportRoot, MANIFEST_REPORT),
    JSON.stringify({
      formatter: context.project.formatter,
      formatterDetected: context.project.formatterDetected,
      sourceRoots: context.project.sourceRoots,
      ...(context.quick ? { quick: true } : {}),
      testsRan: outcome.testsRan,
      testFailures: outcome.testFailures ?? [],
      testRunner: context.project.testRunner,
    }),
  );
  return failures;
}

export function lintOptions(context: ToolContext): string[] {
  const config = ruffLintConfig(context);
  const style = pytestStyle(context.projectRoot, undefined, context.policyRoot);
  return [
    '--config',
    config.file,
    ...(config.setsTargetVersion ? [] : ['--target-version', context.project.targetVersion]),
    '--line-length',
    config.lineLength,
    ...pytestStyleFlags(style),
    '--ignore-noqa',
    '--no-cache',
    ...ruffExclusions(context),
  ];
}

export function lint(context: ToolContext): void {
  run(
    context,
    [
      'ruff',
      'check',
      ...lintOptions(context),
      '--output-format',
      'sarif',
      '--output-file',
      path.join(context.reportRoot, RUFF_REPORT),
      '.',
    ],
    { accepted: [0, 1], rule: 'ruff-failed' },
  );
}

export function unformattedPaths(
  formatter: string,
  { stdout, stderr }: Pick<SpawnResult, 'stdout' | 'stderr'>,
): string[] {
  if (formatter === BLACK) {
    return [...stderr.matchAll(/^would reformat (.+)$/gm)].map((match) => match[1] ?? '');
  }
  return [...stdout.matchAll(/^--- (.+)\n\+\+\+ \1$/gm)].map((match) => match[1] ?? '');
}

export function onlyUnparsableFiles(
  formatter: string,
  { status, stdout, stderr }: SpawnResult,
): boolean {
  if (status !== FORMAT_FAILURE_STATUS[formatter]) {
    return false;
  }
  const errors = `${stdout}\n${stderr}`.split('\n').filter((line) => line.startsWith('error:'));
  return errors.length > 0 && errors.every((line) => PARSE_ERROR[formatter]?.test(line) === true);
}

function format(context: ToolContext): void {
  const { formatter } = context.project;
  const command = formatCommand(context);
  const result = execute(context, command);
  const tolerated =
    result.status === 0 || result.status === 1 || onlyUnparsableFiles(formatter, result);
  if (result.error !== undefined || !tolerated) {
    throw failure({ context, command, result, rule: 'format-failed' });
  }
  const paths = unformattedPaths(formatter, result);
  if (result.status === 1 && paths.length === 0) {
    throw Object.assign(
      new Error(
        `${formatter} reported unformatted files but its output named none:\n${result.stdout}${result.stderr}`,
      ),
      { rule: 'format-failed' },
    );
  }
  writeFileSync(path.join(context.reportRoot, FORMAT_REPORT), paths.join('\n'));
}

export { mutationVersions, toolVersions } from './versions/tool-versions.mts';
