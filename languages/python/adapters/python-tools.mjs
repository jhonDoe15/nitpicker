import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { jscpdVersion } from '../../../core/tooling/jscpd/run-jscpd.mjs';
import { TESTS_FAILED_RULE } from '../../../shared/rules/finding-helpers.mjs';
import { scanImports } from './analysis/python-coupling.mjs';
import { scanDependencies } from './dependencies/dependency-findings.mjs';
import { runDuplicates } from './analysis/python-duplicates.mjs';
import { detectEnvironment, openEnvironment } from './execution/python-environment.mjs';
import { checkRules } from './analysis/python-ast-rules.mjs';
import { pytestStyle, pytestStyleFlags } from '../rules/libraries/pytest-style.mjs';
import { importLinterEnabled, runImportLinter } from './analysis/python-import-linter.mjs';
import { MUTMUT_VERSION_PROBE } from './mutation/python-mutation.mjs';
import { execute, failure, probeVersion, run } from './execution/python-process.mjs';
import {
  detectFormatter,
  detectSourceRoots,
  detectTargetVersion,
  detectTypeCheckers,
  importRoots,
} from './execution/python-project.mjs';
import { formatCommand, ruffExclusions } from './formatting/format-command.mjs';
import { ruffConfigFor } from './configuration/python-ruff-config.mjs';
import { detectTestRunner, pytestLabel, testRunnerLabel } from './execution/python-test-runner.mjs';
import { test } from './test-runs/test-step.mjs';

import { resolveTypeChecker, typeCheck } from './python-types.mjs';
import { structure } from './analysis/python-structure.mjs';

export const RUFF_REPORT = 'ruff.sarif';
export const FORMAT_REPORT = 'format.txt';
export const MANIFEST_REPORT = 'manifest.json';
const COVERAGE_DATA = '.coverage';
const FORMAT_FAILURE_STATUS = { black: 123, ruff: 2 };
const PARSE_ERROR = {
  black: /^error: cannot (?:format .+: cannot )?parse\b/i,
  ruff: /^error: Failed to parse /,
};

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
  policyRoot,
  toolPrecedence,
  pytestAddopts,
}) {
  const launcher = openEnvironment(detectEnvironment(liveRoot, settings.environment), liveRoot);
  const sourceRoots = detectSourceRoots(projectRoot, settings.sourceRoots);
  const pythonPath = [...importRoots(projectRoot, sourceRoots), process.env.PYTHONPATH]
    .filter((entry) => entry !== undefined && entry !== '')
    .join(path.delimiter);
  return {
    projectRoot,
    reportRoot,
    snapshot,
    baselineRoot,
    conventions,
    policyRoot,
    toolPrecedence,
    launcher,
    exclude,
    duplicateSkippedFolders,
    pytestAddopts,
    project: {
      formatter: detectFormatter(projectRoot, settings.formatter),
      formatterDetected: settings.formatter === undefined,
      typeCheckers: detectTypeCheckers(liveRoot, settings.typeChecker),
      testRunner: detectTestRunner(projectRoot, settings.testRunner),
      targetVersion: detectTargetVersion(projectRoot),
      importLinter: settings.importLinter,
      sourceRoots,
      entryPoints: settings.entryPoints ?? [],
    },
    env: {
      PYTHONPATH: pythonPath,
      PYTHONDONTWRITEBYTECODE: '1',
      ...(reportRoot === undefined ? {} : { COVERAGE_FILE: path.join(reportRoot, COVERAGE_DATA) }),
    },
  };
}

export function runPythonTools(context) {
  const outcome = {};
  const steps = [
    lint,
    format,
    test,
    typeCheck,
    checkRules,
    structure,
    runDuplicates,
    (stepContext) => {
      scanImports(stepContext, run);
      scanDependencies(stepContext, run);
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
      return [
        {
          rule: error.rule ?? 'python-failed',
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
      testsRan: outcome.testsRan,
      testFailures: outcome.testFailures ?? [],
      testRunner: context.project.testRunner,
    }),
  );
  return failures;
}

export function lint(context) {
  run(
    context,
    [
      'ruff',
      'check',
      '--config',
      ruffConfigFor(context),
      '--target-version',
      context.project.targetVersion,
      ...pytestStyleFlags(pytestStyle(context.projectRoot)),
      '--ignore-noqa',
      '--no-cache',
      ...ruffExclusions(context),
      '--output-format',
      'sarif',
      '--output-file',
      path.join(context.reportRoot, RUFF_REPORT),
      '.',
    ],
    { accepted: [0, 1], rule: 'ruff-failed' },
  );
}

export function unformattedPaths(formatter, { stdout, stderr }) {
  if (formatter === 'black') {
    return [...stderr.matchAll(/^would reformat (.+)$/gm)].map((match) => match[1]);
  }
  return [...stdout.matchAll(/^--- (.+)\n\+\+\+ \1$/gm)].map((match) => match[1]);
}

export function onlyUnparsableFiles(formatter, { status, stdout, stderr }) {
  if (status !== FORMAT_FAILURE_STATUS[formatter]) {
    return false;
  }
  const errors = `${stdout}\n${stderr}`.split('\n').filter((line) => line.startsWith('error:'));
  return errors.length > 0 && errors.every((line) => PARSE_ERROR[formatter].test(line));
}

function format(context) {
  const { formatter } = context.project;
  const command = formatCommand(context);
  const result = execute(context, command);
  const tolerated = [0, 1].includes(result.status) || onlyUnparsableFiles(formatter, result);
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

function typeCheckerVersion(context) {
  const checker = resolveTypeChecker(context);
  return checker === undefined
    ? 'types@missing'
    : `${checker}@${probeVersion(context, [checker, '--version'])}`;
}

const IMPORT_LINTER_METADATA = [
  'python',
  '-I',
  '-c',
  'import importlib.metadata as m; print(m.version("import-linter"))',
];

function importLinterVersion(context) {
  const { importLinter } = context.project;
  if (!importLinterEnabled(context.projectRoot, importLinter)) {
    return [];
  }
  const installed = probeVersion(context, IMPORT_LINTER_METADATA);
  const version =
    installed === 'missing' ? probeVersion(context, ['lint-imports', '--version']) : installed;
  return [`import-linter@${version}`];
}

export function toolVersions(context) {
  const { formatter } = context.project;
  return [
    `ruff@${probeVersion(context, ['ruff', '--version'])}`,
    ...(formatter === 'black' ? [`black@${probeVersion(context, ['black', '--version'])}`] : []),
    typeCheckerVersion(context),
    `coverage@${probeVersion(context, ['coverage', '--version'])}`,
    testRunnerLabel(context),
    `jscpd@${jscpdVersion()}`,
    ...importLinterVersion(context),
  ].join(';');
}

export function mutationVersions(context) {
  return [`mutmut@${probeVersion(context, MUTMUT_VERSION_PROBE)}`, pytestLabel(context)].join(';');
}
