import { globSync } from 'node:fs';
import path from 'node:path';
import {
  NODE_TEST_OPTIONS_NITPICKER_SETS,
  RUNNER_NAMES,
} from '../../../preset/test-runner/runners.mjs';
import { spawnNodeTool, withoutOptions } from '../typed/runner-tools.mts';
import type { RunnerCommand, TestOptions, TestRun } from '../typed/runner-types.mts';
import { startV8Coverage } from '../v8-coverage/v8-coverage-run.mts';
import { startTestConsole } from '../test-console-run.mts';
import { checkoutModuleUrl } from '../../../../../shared/paths/checkout-module.mjs';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import {
  readRun,
  removeTemporary,
  runnableTestFiles,
  temporaryProjectPath,
  testTimeoutMs,
  uncoveredRun,
  workerCount,
} from '../test-run.mts';

const REPORTER = checkoutModuleUrl(new URL('node-test-reporter.mjs', import.meta.url)).href;
const TYPESCRIPT_FILE = /\.[cm]?ts$/u;
const SCRIPT_EXTENSIONS = '{cjs,mjs,js,cts,mts,ts}';
const LOADER_OPTIONS = new Set([
  '--import',
  '--require',
  '-r',
  '--loader',
  '--experimental-loader',
]);

const SKIPPED_DIRECTORY = /^(?:node_modules|\.nitpicker-diff-.*)$/u;

const NODE_DEFAULT_PATTERNS = [
  `**/*.test.${SCRIPT_EXTENSIONS}`,
  `**/*-test.${SCRIPT_EXTENSIONS}`,
  `**/*_test.${SCRIPT_EXTENSIONS}`,
  `**/test-*.${SCRIPT_EXTENSIONS}`,
  `**/test.${SCRIPT_EXTENSIONS}`,
  `**/test/**/*.${SCRIPT_EXTENSIONS}`,
];

const VALUED_NODE_OPTIONS = new Set([
  '--import',
  '--require',
  '-r',
  '--loader',
  '--experimental-loader',
  '--env-file',
  '--conditions',
  '-C',
  '--test-name-pattern',
  '--test-skip-pattern',
]);

function splitArguments(tokens: readonly string[]): {
  readonly options: string[];
  readonly patterns: string[];
} {
  const options: string[] = [];
  const patterns: string[] = [];
  const pending = { value: false };
  for (const token of tokens) {
    const isOptionValue = pending.value;
    pending.value = !isOptionValue && VALUED_NODE_OPTIONS.has(token);
    if (isOptionValue || token.startsWith('-')) {
      options.push(token);
    } else {
      patterns.push(token);
    }
  }
  return { options, patterns };
}

function typeStrippingArguments(
  nodeArguments: readonly string[],
  files: readonly string[],
): string[] {
  const hasTypeScript = files.some((file) => TYPESCRIPT_FILE.test(file));
  const usesLoader = nodeArguments.some((token) =>
    LOADER_OPTIONS.has(token.split('=')[0] ?? token),
  );
  const needsStripping = (hasTypeScript && !usesLoader) || TYPESCRIPT_FILE.test(REPORTER);
  return needsStripping && process.features.typescript === false
    ? ['--experimental-strip-types']
    : [];
}

function entryName(entry: unknown): string {
  const name = fieldOf(entry, 'name');
  return typeof name === 'string' ? name : String(entry);
}

function matchedFiles(projectRoot: string, patterns: readonly string[]): string[] {
  return globSync(patterns, {
    cwd: projectRoot,
    exclude: (entry: unknown) => SKIPPED_DIRECTORY.test(path.basename(entryName(entry))),
  }).map((file) => path.resolve(projectRoot, file));
}

function selectedTestFiles(
  options: TestOptions,
  patterns: readonly string[],
  files: readonly string[],
): readonly string[] {
  const selected = [...new Set([...matchedFiles(options.projectRoot, patterns), ...files])];
  return selected.length === 0 ? patterns : selected;
}

export function nodeTestSelection(
  options: TestOptions,
  command: RunnerCommand,
): {
  readonly nodeArguments: string[];
  readonly scriptOptions: string[];
  readonly testFiles: readonly string[];
} {
  const { options: scriptOptions, patterns } = splitArguments(
    withoutOptions(command.arguments_, NODE_TEST_OPTIONS_NITPICKER_SETS),
  );
  const files = runnableTestFiles(options);
  return {
    nodeArguments: [
      ...command.nodeArguments,
      ...typeStrippingArguments(command.nodeArguments, files),
    ],
    scriptOptions,
    testFiles: selectedTestFiles(
      options,
      patterns.length === 0 ? NODE_DEFAULT_PATTERNS : patterns,
      files,
    ),
  };
}

function testArguments(options: TestOptions, command: RunnerCommand, reportPath: string): string[] {
  const { nodeArguments, scriptOptions, testFiles } = nodeTestSelection(options, command);
  return [
    ...nodeArguments,
    '--test',
    `--test-reporter=${REPORTER}`,
    `--test-reporter-destination=${reportPath}`,
    `--test-timeout=${String(testTimeoutMs(options, testFiles, { hooks: false }))}`,
    `--test-concurrency=${String(workerCount(options))}`,
    ...(options.rerun === undefined ? [] : [`--test-name-pattern=${options.rerun.namePattern}`]),
    ...scriptOptions,
    ...(options.rerun?.files ?? testFiles),
  ];
}

export async function runNodeTest(options: TestOptions, command: RunnerCommand): Promise<TestRun> {
  const reportPath = temporaryProjectPath(options, 'node-test-report.json');
  const testConsole = startTestConsole(options, { collectsLines: true });
  const coverage =
    options.rerun === undefined ? startV8Coverage(options, command) : uncoveredRun(command);
  try {
    const result = spawnNodeTool({
      options,
      nodeArguments: [...coverage.nodeArguments, ...testArguments(options, command, reportPath)],
      environment: { ...coverage.environment, ...testConsole.environment },
      arguments_: [],
    });
    testConsole.finish();
    const run = readRun({
      reportPath,
      result,
      runnerName: RUNNER_NAMES.node,
      snapshot: options.snapshot,
    });
    if (!run.failed) {
      await coverage.write();
    }
    return run;
  } finally {
    removeTemporary(reportPath);
    testConsole.remove();
    coverage.remove();
  }
}
