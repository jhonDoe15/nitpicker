import { globSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { withoutOptions } from '../../../preset/test-runner/script-command.mjs';
import {
  NODE_TEST_OPTIONS_NITPICKER_SETS,
  RUNNER_NAMES,
} from '../../../preset/test-runner/runners.mjs';
import { spawnNodeTool } from '../../quality-areas/runners/tooling.mjs';
import { startV8Coverage } from '../v8-coverage/v8-coverage-run.mjs';
import {
  readRun,
  removeTemporary,
  runnableTestFiles,
  temporaryProjectPath,
  testTimeoutMs,
  uncoveredRun,
  workerCount,
} from '../test-run.mjs';

const REPORTER = pathToFileURL(path.join(import.meta.dirname, 'node-test-reporter.mjs')).href;
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

function splitArguments(tokens) {
  const options = [];
  const patterns = [];
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

function typeStrippingArguments(nodeArguments, files) {
  const hasTypeScript = files.some((file) => TYPESCRIPT_FILE.test(file));
  const usesLoader = nodeArguments.some((token) => LOADER_OPTIONS.has(token.split('=')[0]));
  return hasTypeScript && !usesLoader && process.features.typescript === false
    ? ['--experimental-strip-types']
    : [];
}

function matchedFiles(projectRoot, patterns) {
  return globSync(patterns, {
    cwd: projectRoot,
    exclude: (entry) => SKIPPED_DIRECTORY.test(path.basename(entry.name ?? entry)),
  }).map((file) => path.resolve(projectRoot, file));
}

function selectedTestFiles(options, patterns, files) {
  const selected = [...new Set([...matchedFiles(options.projectRoot, patterns), ...files])];
  return selected.length === 0 ? patterns : selected;
}

export function nodeTestSelection(options, command) {
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

function testArguments(options, command, reportPath) {
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

export async function runNodeTest(options, command) {
  const reportPath = temporaryProjectPath(options, 'node-test-report.json');
  const coverage =
    options.rerun === undefined ? startV8Coverage(options, command) : uncoveredRun(command);
  try {
    const result = spawnNodeTool({
      options,
      nodeArguments: [...coverage.nodeArguments, ...testArguments(options, command, reportPath)],
      environment: coverage.environment,
      arguments_: [],
    });
    const run = readRun({ reportPath, result, runnerName: RUNNER_NAMES.node });
    if (!run.failed) {
      await coverage.write();
    }
    return run;
  } finally {
    removeTemporary(reportPath);
    coverage.remove();
  }
}
