import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { TESTS_FAILED_RULE } from '../../../shared/rules/finding-helpers.mjs';
import { detectEnvironment, openEnvironment } from './python-environment.mjs';
import { detectFormatter, detectSourceRoots, importRoots } from './python-project.mjs';

const RUFF_CONFIG = path.resolve(import.meta.dirname, '../ruff/nitpicker-ruff.toml');
export const RUFF_REPORT = 'ruff.sarif';
export const FORMAT_REPORT = 'format.txt';
export const COVERAGE_REPORT = 'coverage.json';
export const MANIFEST_REPORT = 'manifest.json';
const COVERAGE_CONFIG = 'coveragerc';
const COVERAGE_DATA = '.coverage';
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const TOOL_TIMEOUT_MS = 25 * 60 * 1000;
const MESSAGE_TAIL_LENGTH = 3000;
const NO_TESTS_EXIT = 5;
const PYTEST_VERSION_PROBE = ['python', '-c', 'import pytest; print(pytest.__version__)'];
const VERSION_PATTERN = /\d+(?:\.\d+)+\S*/;

export function createToolContext({ projectRoot, liveRoot, settings = {}, reportRoot }) {
  const launcher = openEnvironment(detectEnvironment(liveRoot, settings.environment), liveRoot);
  const sourceRoots = detectSourceRoots(projectRoot, settings.sourceRoots);
  const pythonPath = [...importRoots(projectRoot, sourceRoots), process.env.PYTHONPATH]
    .filter((entry) => entry !== undefined && entry !== '')
    .join(path.delimiter);
  return {
    projectRoot,
    reportRoot,
    launcher,
    project: {
      formatter: detectFormatter(projectRoot, settings.formatter),
      testRunner: settings.testRunner,
      sourceRoots,
    },
    env: {
      PYTHONPATH: pythonPath,
      PYTHONDONTWRITEBYTECODE: '1',
      ...(reportRoot === undefined ? {} : { COVERAGE_FILE: path.join(reportRoot, COVERAGE_DATA) }),
    },
  };
}

function execute(context, command) {
  const [tool, ...args] = command;
  const launch = context.launcher.launch(tool, args);
  return spawnSync(launch.command, launch.args, {
    cwd: context.projectRoot,
    env: { ...process.env, ...launch.env, ...context.env },
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout: TOOL_TIMEOUT_MS,
  });
}

function run(context, command, { accepted = [0], rule }) {
  const result = execute(context, command);
  if (result.error !== undefined || !accepted.includes(result.status)) {
    throw Object.assign(new Error(describeFailure({ context, command, result })), { rule });
  }
  return result;
}

function describeFailure({ context, command, result }) {
  const [tool, subcommand = '-'] = command;
  const label = subcommand.startsWith('-') ? tool : `${tool} ${subcommand}`;
  const where = `the ${context.launcher.description} environment`;
  if (result.error?.code === 'ENOENT') {
    return `${tool} was not found in ${where}: install it there (for example as a dev dependency)`;
  }
  if (result.error !== undefined) {
    return `${label} could not run in ${where}: ${result.error.message}`;
  }
  const output = `${result.stdout}\n${result.stderr}`.trim() || 'no diagnostic output';
  const tail =
    output.length > MESSAGE_TAIL_LENGTH ? `...${output.slice(-MESSAGE_TAIL_LENGTH)}` : output;
  return `${label} exited ${String(result.status)} in ${where}:\n${tail}`;
}

export function runPythonTools(context) {
  const failures = [lint, format, test].flatMap((step) => {
    try {
      step(context);
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
      sourceRoots: context.project.sourceRoots,
    }),
  );
  return failures;
}

function lint(context) {
  run(
    context,
    [
      'ruff',
      'check',
      '--config',
      RUFF_CONFIG,
      '--ignore-noqa',
      '--no-cache',
      '--output-format',
      'sarif',
      '--output-file',
      path.join(context.reportRoot, RUFF_REPORT),
      '.',
    ],
    { accepted: [0, 1], rule: 'ruff-failed' },
  );
}

const FORMAT_COMMANDS = {
  black: ['black', '--check', '.'],
  ruff: ['ruff', 'format', '--check', '--diff', '--no-cache', '.'],
};

export function unformattedPaths(formatter, { stdout, stderr }) {
  if (formatter === 'black') {
    return [...stderr.matchAll(/^would reformat (.+)$/gm)].map((match) => match[1]);
  }
  return [...stdout.matchAll(/^--- (.+)\n\+\+\+ \1$/gm)].map((match) => match[1]);
}

function format(context) {
  const { formatter } = context.project;
  const result = run(context, FORMAT_COMMANDS[formatter], {
    accepted: [0, 1],
    rule: 'format-failed',
  });
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

function testCommand(context, runner) {
  if (runner === 'pytest') {
    return ['-m', 'pytest', '-q', '-p', 'no:cacheprovider'];
  }
  const directory = ['tests', 'test'].find((name) =>
    existsSync(path.join(context.projectRoot, name)),
  );
  return ['-m', 'unittest', 'discover', ...(directory === undefined ? [] : ['-s', directory])];
}

function test(context) {
  const runner = detectTestRunner(context);
  const config = path.join(context.reportRoot, COVERAGE_CONFIG);
  const sources = context.project.sourceRoots.map((root) => `    ${root}`).join('\n');
  writeFileSync(config, `[run]\nbranch = True\nparallel = False\nsource =\n${sources}\n`);
  run(context, ['coverage', 'run', '--rcfile', config, ...testCommand(context, runner)], {
    accepted: [0, NO_TESTS_EXIT],
    rule: TESTS_FAILED_RULE,
  });
  run(
    context,
    [
      'coverage',
      'json',
      '--rcfile',
      config,
      '-o',
      path.join(context.reportRoot, COVERAGE_REPORT),
      '--fail-under=0',
      '--ignore-errors',
    ],
    { rule: 'coverage-failed' },
  );
}

function probeVersion(context, command) {
  const result = execute(context, command);
  if (result.error !== undefined || result.status !== 0) {
    return 'missing';
  }
  return VERSION_PATTERN.exec(result.stdout)?.[0] ?? 'unknown';
}

function testRunnerVersion(context) {
  const { testRunner } = context.project;
  if (testRunner === 'unittest') {
    return 'unittest';
  }
  const version = probeVersion(context, PYTEST_VERSION_PROBE);
  if (version === 'missing' && testRunner === undefined) {
    return 'unittest';
  }
  return `pytest@${version}`;
}

export function detectTestRunner(context) {
  return testRunnerVersion(context).split('@')[0];
}

export function toolVersions(context) {
  const { formatter } = context.project;
  return [
    `ruff@${probeVersion(context, ['ruff', '--version'])}`,
    ...(formatter === 'black' ? [`black@${probeVersion(context, ['black', '--version'])}`] : []),
    `coverage@${probeVersion(context, ['coverage', '--version'])}`,
    testRunnerVersion(context),
  ].join(';');
}
