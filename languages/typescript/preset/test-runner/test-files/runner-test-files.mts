import path from 'node:path';
import { fieldOf, textsOf } from '../../../../../shared/values/readers.mts';
import type {
  DetectionLayout,
  TestCommand,
  TestFileFacts,
  TestFileRequest,
} from '../typed/command-types.mts';
import type { LayoutTestFiles } from '../../layout/layout-types.mts';
import { projectConfigFile } from '../../test-environment/config-files.mts';
import { hasDomEnvironment } from '../../test-environment/environments.mts';
import {
  globalDomEnvironments,
  nodeSetupEntries,
} from '../../test-environment/global-dom/global-dom.mts';
import { readViteConfig } from '../../test-environment/vite/vite-reader.mts';
import { testRunnerFor } from '../detect-runner.mts';
import { NODE_TEST_OPTIONS_NITPICKER_SETS } from '../runners.mts';
import { runnerCommand } from '../script-command.mts';
import { jestTestFiles } from './jest-test-files.mts';
import { mochaTestFiles } from './mocha-test-files.mts';
import {
  NODE_DEFAULT_PATTERNS,
  VITEST_TEST_FILES,
  defaultTestFiles,
  testFilePatterns,
} from './test-file-patterns.mts';

const TIMEOUT_MS = 30_000;
const NO_COMMAND: TestCommand = {
  environment: {},
  nodeArguments: [],
  arguments_: [],
  precedingCommands: [],
};
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

export function nodeScriptPatterns(tokens: readonly string[]): string[] {
  const patterns: string[] = [];
  const pending = { value: false };
  for (const token of tokens) {
    const isValue = pending.value;
    pending.value = !isValue && VALUED_NODE_OPTIONS.has(token);
    if (!(isValue || token.startsWith('-'))) {
      patterns.push(token);
    }
  }
  return patterns;
}

function nodeTestFiles({ projectRoot, command }: TestFileRequest): TestFileFacts {
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

function viteFailure(projectRoot: string, configFile: string, failure: string | undefined): string {
  const name = path.relative(projectRoot, configFile).split(path.sep).join('/');
  return `The Vitest config ${name} could not be read (${String(failure)}), so nitpicker takes Vitest's default include as the project's test files.`;
}

function vitestTestFiles({
  projectRoot,
  liveProjectRoot,
  timeoutMs,
}: TestFileRequest): TestFileFacts {
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
  const project = fieldOf(read.result, 'testFiles');
  return {
    testFiles: testFilePatterns({
      include: [...VITEST_TEST_FILES, ...textsOf(fieldOf(project, 'include'))],
      exclude: textsOf(fieldOf(project, 'exclude')),
    }),
    domEnvironment: hasDomEnvironment(fieldOf(read.result, 'environments')),
  };
}

const READERS: Readonly<Record<string, (request: TestFileRequest) => TestFileFacts>> = {
  vitest: vitestTestFiles,
  jest: jestTestFiles,
  mocha: mochaTestFiles,
  node: nodeTestFiles,
};

export function runnerTestFileFacts(
  projectRoot: string,
  {
    configured,
    layout,
    liveProjectRoot,
  }: {
    readonly configured?: string | undefined;
    readonly layout?: DetectionLayout | undefined;
    readonly liveProjectRoot?: string | undefined;
  } = {},
): TestFileFacts {
  const detected = testRunnerFor(projectRoot, configured, layout);
  const command = runnerCommand(detected.command, detected.runner) ?? NO_COMMAND;
  const read = READERS[detected.runner];
  if (read === undefined) {
    throw new TypeError(`Unknown test runner: ${detected.runner}`);
  }
  return read({
    projectRoot,
    liveProjectRoot: liveProjectRoot ?? projectRoot,
    command,
    timeoutMs: TIMEOUT_MS,
  });
}

export function runnerTestFiles(
  projectRoot: string,
  options?: { readonly configured?: string | undefined },
): LayoutTestFiles {
  return runnerTestFileFacts(projectRoot, options).testFiles;
}
