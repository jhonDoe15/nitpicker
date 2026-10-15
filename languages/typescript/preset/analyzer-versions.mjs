import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PACKAGE_ROOT, resolveTool } from '../../../core/tooling/tool-resolution.mjs';

const TOOL_BY_ANALYZER = {
  'entry-points': 'dependency-cruiser',
  'prettier-format': 'prettier',
  'typescript-typecheck': 'typescript',
  'dependency-architecture': 'dependency-cruiser',
  'policy-tests': 'vitest',
  'coding-standards': 'eslint',
  coupling: 'dependency-cruiser',
  'test-runtime': 'dependency-cruiser',
  structure: 'typescript',
  duplicates: 'jscpd',
  'dead-code': 'knip',
  coverage: 'vitest',
  crap: '@barney-media/crap-typescript-core',
  mutation: '@stryker-mutator/core',
};
const TEST_RUNNER_ANALYZERS = new Set(['coverage', 'crap', 'mutation']);
const TEST_RUNNER_TOOLS = new Map([
  ['jest', ['jest']],
  ['node-test', ['c8']],
]);
const TYPESCRIPT_CONSUMERS = new Set([
  'coding-standards',
  'test-runtime',
  'eslint-lint',
  'eslint-errors',
  'eslint-logging',
  'eslint-module-effects',
]);

const OXLINT_PACKAGES = ['oxlint', 'oxlint-tsgolint'];

export const ESLINT_PLUGIN_PACKAGES = [
  '@eslint/js',
  '@vitest/eslint-plugin',
  'eslint-plugin-functional',
  'eslint-plugin-jsx-a11y-x',
  'eslint-plugin-react-hooks',
  'eslint-plugin-react-x',
  'eslint-plugin-testing-library',
  'typescript-eslint',
];

function resolveEslintPluginVersions(resolve) {
  const plugins = ESLINT_PLUGIN_PACKAGES.map(
    (name) => `${name}@${resolve(name, { projectRoot: PACKAGE_ROOT }).version}`,
  );
  const nitpickerVersion = JSON.parse(
    readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'),
  ).version;
  return [...plugins, `nitpicker-plugin@${String(nitpickerVersion)}`].join(',');
}

function resolveTestRunnerVersion(runner, liveProjectRoot, resolve) {
  const versions = TEST_RUNNER_TOOLS.get(runner).map(
    (name) => `${name}@${resolve(name, { projectRoot: liveProjectRoot }).version}`,
  );
  return runner === 'node-test'
    ? [...versions, `node@${process.versions.node}`].join(';')
    : versions[0];
}

export function resolveAnalyzerVersion(analyzerName, liveProjectRoot, resolve = resolveTool) {
  const toolName = analyzerName.startsWith('eslint-') ? 'eslint' : TOOL_BY_ANALYZER[analyzerName];
  if (toolName === undefined) {
    throw new Error(`No tool is configured for analyzer ${analyzerName}`);
  }

  const toolRoot = analyzerName === 'structure' ? PACKAGE_ROOT : liveProjectRoot;
  const version = resolve(toolName, { projectRoot: toolRoot }).version;
  if (analyzerName === 'typescript-typecheck') {
    return `${version};typescript-native@${resolve('typescript-native', { projectRoot: PACKAGE_ROOT }).version}`;
  }
  if (!TYPESCRIPT_CONSUMERS.has(analyzerName)) {
    return version;
  }

  const typeScriptVersion = resolve('typescript', {
    projectRoot: PACKAGE_ROOT,
  }).version;
  const base = `${toolName}@${version};typescript@${typeScriptVersion};plugins:${resolveEslintPluginVersions(resolve)}`;
  return analyzerName.startsWith('eslint-') ? `${base};${resolveOxlintVersions(resolve)}` : base;
}

function resolveOxlintVersions(resolve) {
  return OXLINT_PACKAGES.map(
    (name) => `${name}@${resolve(name, { projectRoot: PACKAGE_ROOT }).version}`,
  ).join(',');
}

export function resolveTestRunnerAnalyzerVersion({
  analyzerName,
  projectRoot,
  testRunner,
  resolve = resolveTool,
}) {
  if (!TEST_RUNNER_ANALYZERS.has(analyzerName) || !TEST_RUNNER_TOOLS.has(testRunner)) {
    return resolveAnalyzerVersion(analyzerName, projectRoot, resolve);
  }
  const runnerVersion = resolveTestRunnerVersion(testRunner, projectRoot, resolve);
  return analyzerName === 'coverage'
    ? runnerVersion
    : `${resolveAnalyzerVersion(analyzerName, projectRoot, resolve)};tests:${runnerVersion}`;
}
