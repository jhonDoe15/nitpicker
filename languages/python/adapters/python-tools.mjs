import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { jscpdVersion } from '../../java/adapters/metrics/java-duplicates.mjs';
import { TESTS_FAILED_RULE } from '../../../shared/rules/finding-helpers.mjs';
import { scanImports } from './analysis/python-coupling.mjs';
import { runDuplicates } from './analysis/python-duplicates.mjs';
import { globToRegExpSource } from '../../../shared/glob.mjs';
import { detectEnvironment, openEnvironment } from './execution/python-environment.mjs';
import { checkRules } from './analysis/python-ast-rules.mjs';
import { crap } from './mutation/python-crap.mjs';
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
import { RUFF_CONFIG } from './configuration/python-ruff-config.mjs';
import {
  detectTestRunner,
  NO_TESTS_EXIT,
  pytestLabel,
  testCommand,
  testRunnerLabel,
  testsRan,
} from './execution/python-test-runner.mjs';
import { resolveTypeChecker, typeCheck } from './python-types.mjs';
import { structure } from './analysis/python-structure.mjs';

export const RUFF_REPORT = 'ruff.sarif';
export const FORMAT_REPORT = 'format.txt';
export const COVERAGE_REPORT = 'coverage.json';
export const MANIFEST_REPORT = 'manifest.json';
const COVERAGE_CONFIG = 'coveragerc';
const COVERAGE_DATA = '.coverage';
const UNTESTABLE_LINES = [
  String.raw`^\s*if (typing\.)?TYPE_CHECKING:`,
  String.raw`^\s*if __name__ == .__main__.:`,
  String.raw`^\s*@(typing\.)?overload\b`,
  String.raw`^\s*raise NotImplementedError\b`,
];
const TEST_FILES = ['test_*.py', '*_test.py', 'conftest.py', '*/tests/*', '*/test/*'];
const EMPTY_COVERAGE_REPORT = '{"files":{}}';
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
  snapshot = 'head',
  baselineRoot,
  probes = new Map(),
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
    probes,
    launcher,
    exclude,
    project: {
      formatter: detectFormatter(projectRoot, settings.formatter),
      formatterDetected: settings.formatter === undefined,
      typeCheckers: detectTypeCheckers(liveRoot, settings.typeChecker),
      testRunner: detectTestRunner(projectRoot, settings.testRunner),
      targetVersion: detectTargetVersion(projectRoot),
      importLinter: settings.importLinter,
      sourceRoots,
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
    crap,
    runDuplicates,
    (stepContext) => {
      scanImports(stepContext, run);
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
      RUFF_CONFIG,
      '--target-version',
      context.project.targetVersion,
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

function ruffExclusions({ exclude }) {
  return exclude.flatMap((glob) => ['--extend-exclude', glob]);
}

function blackExclusions({ exclude }) {
  if (exclude.length === 0) {
    return [];
  }
  const patterns = exclude.map((glob) => `^/${globToRegExpSource(glob).slice(1, -1)}(?:/.*)?/?$`);
  return ['--extend-exclude', patterns.join('|')];
}

function formatCommand({ project, ...context }) {
  return project.formatter === 'black'
    ? ['black', '--check', ...blackExclusions(context), '.']
    : ['ruff', 'format', '--check', '--diff', '--no-cache', ...ruffExclusions(context), '.'];
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

function coverageSources({ projectRoot, project }) {
  return project.sourceRoots.filter((root) => existsSync(path.join(projectRoot, root)));
}

function indented(entries) {
  return entries.map((entry) => `    ${entry}`).join('\n');
}

function coverageConfig(sources) {
  return [
    '[run]',
    'branch = True',
    'parallel = False',
    `source =\n${indented(sources)}`,
    `omit =\n${indented(TEST_FILES)}`,
    '[report]',
    `exclude_lines =\n${indented(UNTESTABLE_LINES)}`,
    'partial_branches =',
    '',
  ].join('\n');
}

function test(context, outcome) {
  const sources = coverageSources(context);
  const config = path.join(context.reportRoot, COVERAGE_CONFIG);
  writeFileSync(config, coverageConfig(sources));
  const result = run(context, ['coverage', 'run', '--rcfile', config, ...testCommand(context)], {
    accepted: [0, NO_TESTS_EXIT],
    rule: TESTS_FAILED_RULE,
  });
  outcome.testsRan = testsRan(result);
  writeCoverageReport(context, { config, measured: sources.length > 0 });
}

function writeCoverageReport(context, { config, measured }) {
  const report = path.join(context.reportRoot, COVERAGE_REPORT);
  if (!measured) {
    writeFileSync(report, EMPTY_COVERAGE_REPORT);
    return;
  }
  run(
    context,
    ['coverage', 'json', '--rcfile', config, '-o', report, '--fail-under=0', '--ignore-errors'],
    { rule: 'coverage-failed' },
  );
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
