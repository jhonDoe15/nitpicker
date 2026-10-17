import path from 'node:path';
import { projectConfigFile } from '../../test-environment/config-files.mjs';
import { hasDomEnvironment } from '../../test-environment/environments.mjs';
import {
  globalDomEnvironments,
  nodeSetupEntries,
} from '../../test-environment/global-dom/global-dom.mjs';
import { readViteConfig } from '../../test-environment/vite/vite-reader.mjs';
import { testRunnerFor } from '../detect-runner.mjs';
import { NODE_TEST_OPTIONS_NITPICKER_SETS } from '../runners.mjs';
import { runnerCommand } from '../script-command.mjs';
import { jestTestFiles } from './jest-test-files.mjs';
import { mochaTestFiles } from './mocha-test-files.mjs';
import {
  NODE_DEFAULT_PATTERNS,
  VITEST_TEST_FILES,
  defaultTestFiles,
  testFilePatterns,
} from './test-file-patterns.mjs';

const TIMEOUT_MS = 30_000;
const NO_COMMAND = { environment: {}, nodeArguments: [], arguments_: [], precedingCommands: [] };
const VALUED_NODE_TEST_OPTIONS = [
  '--test-concurrency',
  '--test-coverage-branches',
  '--test-coverage-exclude',
  '--test-coverage-functions',
  '--test-coverage-include',
  '--test-coverage-lines',
  '--test-global-setup',
  '--test-isolation',
  '--experimental-test-isolation',
  '--test-name-pattern',
  '--test-reporter',
  '--test-reporter-destination',
  '--test-rerun-failures',
  '--test-shard',
  '--test-skip-pattern',
  '--test-timeout',
];
const VALUED_NODE_OPTIONS = new Set([
  ...NODE_TEST_OPTIONS_NITPICKER_SETS.valued,
  ...VALUED_NODE_TEST_OPTIONS,
  '--import',
  '--require',
  '-r',
  '--loader',
  '--experimental-loader',
  '--env-file',
  '--env-file-if-exists',
  '--experimental-config-file',
  '--conditions',
  '-C',
  '--input-type',
  '--disable-warning',
  '--localstorage-file',
]);

export function nodeScriptPatterns(tokens) {
  const patterns = [];
  const pending = { value: false };
  for (const token of tokens) {
    const isValue = pending.value;
    pending.value = !isValue && VALUED_NODE_OPTIONS.has(token);
    if (!isValue && !token.startsWith('-')) {
      patterns.push(token);
    }
  }
  return patterns;
}

function nodeTestFiles({ projectRoot, command }) {
  const patterns = nodeScriptPatterns(command.arguments_);
  return {
    testFiles: testFilePatterns({
      include: patterns.length === 0 ? NODE_DEFAULT_PATTERNS : patterns,
    }),
    domEnvironment: hasDomEnvironment(
      globalDomEnvironments(projectRoot, nodeSetupEntries(command)),
    ),
  };
}

function viteFailure(projectRoot, configFile, failure) {
  const name = path.relative(projectRoot, configFile).split(path.sep).join('/');
  return `The Vitest config ${name} could not be read (${failure}), so nitpicker takes Vitest's default include as the project's test files.`;
}

function vitestTestFiles({ projectRoot, liveProjectRoot, timeoutMs }) {
  const configFile = projectConfigFile(projectRoot);
  if (configFile === undefined) {
    return { testFiles: defaultTestFiles('vitest'), domEnvironment: false };
  }
  const read = readViteConfig({
    configFile,
    projectRoot,
    resolveRoots: [...new Set([projectRoot, liveProjectRoot])],
    timeoutMs,
  });
  if (read.result === undefined) {
    return {
      testFiles: defaultTestFiles('vitest'),
      domEnvironment: false,
      notices: [viteFailure(projectRoot, configFile, read.failure)],
    };
  }
  const project = read.result.testFiles;
  return {
    testFiles: testFilePatterns({
      include: [...VITEST_TEST_FILES, ...(project?.include ?? [])],
      exclude: project?.exclude ?? [],
    }),
    domEnvironment: hasDomEnvironment(read.result.environments),
  };
}

const READERS = {
  vitest: vitestTestFiles,
  jest: jestTestFiles,
  mocha: mochaTestFiles,
  node: nodeTestFiles,
};

export function runnerTestFileFacts(projectRoot, { configured, layout, liveProjectRoot } = {}) {
  const detected = testRunnerFor(projectRoot, configured, layout);
  const command = runnerCommand(detected.command, detected.runner) ?? NO_COMMAND;
  return READERS[detected.runner]({
    projectRoot,
    liveProjectRoot: liveProjectRoot ?? projectRoot,
    command,
    timeoutMs: TIMEOUT_MS,
  });
}

export function runnerTestFiles(projectRoot, options) {
  return runnerTestFileFacts(projectRoot, options).testFiles;
}
