import { globToRegExpSource } from '../../../../../shared/glob.mjs';
import { readLayout } from '../../../preset/head-policy.mjs';
import { readManifest, testScripts } from '../../../preset/test-runner/evidence.mjs';
import { runNodeTool, spawnNodeTool } from '../../quality-areas/runners/tooling.mjs';
import {
  COVERAGE_DIRECTORY,
  coverageExcludeGlobs,
  coverageIncludeGlobs,
  TEST_TIMEOUT_MS,
  TEST_WORKERS,
} from '../coverage-globs.mjs';

const JEST_BIN = 'jest/bin/jest.js';
const ESM_FLAG = '--experimental-vm-modules';
const DEFAULT_IGNORED_PATH = '/node_modules/';

function repeated(flag, values) {
  return values.map((value) => `${flag}=${value}`);
}

function mentionsEsm(text) {
  return typeof text === 'string' && text.includes(ESM_FLAG);
}

function jestNodeArguments(projectRoot) {
  const enabled =
    mentionsEsm(process.env.NODE_OPTIONS) ||
    testScripts(readManifest(projectRoot)).some(([, command]) => mentionsEsm(command));
  return enabled ? [ESM_FLAG] : [];
}

export function jestEnvironment(projectRoot) {
  const flags = jestNodeArguments(projectRoot);
  return flags.length === 0
    ? {}
    : { NODE_OPTIONS: [process.env.NODE_OPTIONS, ...flags].filter(Boolean).join(' ') };
}

function ignoredPathPattern(glob) {
  return `/${globToRegExpSource(glob).slice(1, -1)}$`;
}

function projectIgnoredPaths(options, nodeArguments) {
  const result = spawnNodeTool({
    options,
    relativeToolPath: JEST_BIN,
    nodeArguments,
    arguments_: ['--showConfig', '--watchman=false'],
  });
  if (result.status !== 0) {
    return [DEFAULT_IGNORED_PATH];
  }
  return JSON.parse(result.stdout).configs[0].testPathIgnorePatterns;
}

function ignoredTestPaths(options, layout, nodeArguments) {
  if (layout.exclude.length === 0) {
    return [];
  }
  const excluded = layout.exclude.map(ignoredPathPattern);
  return repeated('--testPathIgnorePatterns', [
    ...new Set([...projectIgnoredPaths(options, nodeArguments), ...excluded]),
  ]);
}

export function runJestWithCoverage({ options, reportPath }) {
  const layout = readLayout();
  const nodeArguments = jestNodeArguments(options.projectRoot);
  return runNodeTool({
    options,
    relativeToolPath: JEST_BIN,
    nodeArguments,
    arguments_: [
      '--coverage',
      '--coverageProvider=babel',
      '--coverageReporters=json',
      `--coverageDirectory=${COVERAGE_DIRECTORY}`,
      '--coverageThreshold={}',
      ...repeated('--collectCoverageFrom', [
        ...coverageIncludeGlobs(layout),
        ...coverageExcludeGlobs(layout).map((glob) => `!${glob}`),
      ]),
      `--coveragePathIgnorePatterns=${DEFAULT_IGNORED_PATH}`,
      ...ignoredTestPaths(options, layout, nodeArguments),
      '--json',
      `--outputFile=${reportPath}`,
      `--testTimeout=${String(TEST_TIMEOUT_MS)}`,
      `--maxWorkers=${String(TEST_WORKERS)}`,
      '--watchman=false',
    ],
    acceptedStatuses: [0, 1],
  });
}
