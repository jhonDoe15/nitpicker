import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PACKAGE_ROOT, resolveTool } from '../../../core/tooling/tool-resolution.mjs';
import { testRunnerFor } from './test-runner/detect-runner.mjs';
import { RUNNER_PACKAGES } from './test-runner/runners.mjs';
import { TYPESCRIPT_API } from '../typescript-api/api-selection.mjs';

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
  'test-console': 'vitest',
  crap: 'typescript',
};
const PACKAGE_ANALYZERS = new Set(['structure', 'crap']);
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
  'eslint-plugin-formatjs',
  'eslint-plugin-functional',
  'eslint-plugin-jsx-a11y-x',
  'eslint-plugin-react-dom',
  'eslint-plugin-react-hooks',
  'eslint-plugin-react-web-api',
  'eslint-plugin-react-x',
  'eslint-plugin-regexp',
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

function testRunnerVersion(liveProjectRoot, resolve, configuredRunner) {
  const { runner } = testRunnerFor(liveProjectRoot, configuredRunner);
  if (runner === 'node') {
    return `node@${process.versions.node}`;
  }
  const name = RUNNER_PACKAGES[runner];
  return `${name}@${resolve(name, { projectRoot: liveProjectRoot }).version}`;
}

export function testRunnerAnalyzerVersion(
  analyzerName,
  liveProjectRoot,
  { resolve = resolveTool, configuredRunner } = {},
) {
  const runnerVersion = testRunnerVersion(liveProjectRoot, resolve, configuredRunner);
  if (analyzerName === 'coverage') {
    return runnerVersion;
  }
  return `${resolve('@stryker-mutator/core', { projectRoot: liveProjectRoot }).version};${runnerVersion}`;
}

function typeScriptApiVersion(resolve, bundled) {
  return bundled
    ? `js-api-${resolve('typescript-js-api', { projectRoot: PACKAGE_ROOT }).version}`
    : resolve('typescript', { projectRoot: PACKAGE_ROOT }).version;
}

export function resolveAnalyzerVersion(
  analyzerName,
  liveProjectRoot,
  { resolve = resolveTool, bundled = TYPESCRIPT_API.bundled } = {},
) {
  if (analyzerName === 'coverage' || analyzerName === 'mutation') {
    return testRunnerAnalyzerVersion(analyzerName, liveProjectRoot, { resolve });
  }
  const toolName = analyzerName.startsWith('eslint-') ? 'eslint' : TOOL_BY_ANALYZER[analyzerName];
  if (toolName === undefined) {
    throw new Error(`No tool is configured for analyzer ${analyzerName}`);
  }

  const version = PACKAGE_ANALYZERS.has(analyzerName)
    ? typeScriptApiVersion(resolve, bundled)
    : resolve(toolName, { projectRoot: liveProjectRoot }).version;
  if (analyzerName === 'typescript-typecheck') {
    return `${version};typescript-native@${resolve('typescript-native', { projectRoot: PACKAGE_ROOT }).version}`;
  }
  if (!TYPESCRIPT_CONSUMERS.has(analyzerName)) {
    return version;
  }

  const typeScriptVersion = typeScriptApiVersion(resolve, bundled);
  const base = `${toolName}@${version};typescript@${typeScriptVersion};plugins:${resolveEslintPluginVersions(resolve)}`;
  return analyzerName.startsWith('eslint-') ? `${base};${resolveOxlintVersions(resolve)}` : base;
}

function resolveOxlintVersions(resolve) {
  return OXLINT_PACKAGES.map(
    (name) => `${name}@${resolve(name, { projectRoot: PACKAGE_ROOT }).version}`,
  ).join(',');
}
