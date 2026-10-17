import { projectConfigFile } from '../../test-environment/config-files.mjs';
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
const VALUED_NODE_OPTIONS = new Set([
  ...NODE_TEST_OPTIONS_NITPICKER_SETS.valued,
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

function nodeTestFiles({ command }) {
  const patterns = nodeScriptPatterns(command.arguments_);
  return testFilePatterns({ include: patterns.length === 0 ? NODE_DEFAULT_PATTERNS : patterns });
}

function vitestTestFiles({ projectRoot, timeoutMs }) {
  const configFile = projectConfigFile(projectRoot);
  if (configFile === undefined) {
    return defaultTestFiles('vitest');
  }
  const read = readViteConfig({ configFile, projectRoot, resolveRoots: [projectRoot], timeoutMs });
  const project = read.result?.testFiles;
  return testFilePatterns({
    include: [...VITEST_TEST_FILES, ...(project?.include ?? [])],
    exclude: project?.exclude ?? [],
  });
}

const READERS = {
  vitest: vitestTestFiles,
  jest: jestTestFiles,
  mocha: mochaTestFiles,
  node: nodeTestFiles,
};

export function runnerTestFiles(projectRoot, configured) {
  const detected = testRunnerFor(projectRoot, configured);
  const command = runnerCommand(detected.command, detected.runner) ?? NO_COMMAND;
  return READERS[detected.runner]({ projectRoot, command, timeoutMs: TIMEOUT_MS });
}
