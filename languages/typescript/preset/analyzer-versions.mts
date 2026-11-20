import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  isToolInstalled,
  PACKAGE_ROOT,
  resolveTool,
} from '../../../core/tooling/tool-resolution.mts';
import { testRunnerFor } from './test-runner/detect-runner.mts';
import { RUNNER_PACKAGES } from './test-runner/runners.mts';
import { selectTypeScriptApi } from '../typescript-api/api-selection.mts';
import { fieldOf, textOf } from '../../../shared/values/readers.mts';

type ToolOptions = { projectRoot?: string | undefined; packageRoot?: string | undefined };
type Resolver = (name: string, options?: ToolOptions) => { version: string };
type Installed = (name: string, options?: ToolOptions) => boolean;
type VersionSources = { resolve: Resolver; bundled: boolean };

const TYPESCRIPT_TOOL = 'typescript';
const DEPENDENCY_CRUISER = 'dependency-cruiser';
const TOOL_BY_ANALYZER: Readonly<Record<string, string>> = {
  'entry-points': DEPENDENCY_CRUISER,
  'prettier-format': 'prettier',
  'typescript-typecheck': TYPESCRIPT_TOOL,
  'dependency-architecture': DEPENDENCY_CRUISER,
  'policy-tests': 'vitest',
  'coding-standards': 'eslint',
  coupling: DEPENDENCY_CRUISER,
  'test-runtime': DEPENDENCY_CRUISER,
  structure: TYPESCRIPT_TOOL,
  duplicates: 'jscpd',
  'dead-code': 'knip',
  crap: TYPESCRIPT_TOOL,
};
const runnerPackages: Readonly<Record<string, string>> = RUNNER_PACKAGES;
const PACKAGE_ANALYZERS = new Set(['structure', 'crap']);
const DEPENDENCY_GRAPH_ANALYZERS = new Set(['entry-points', 'dependency-architecture', 'coupling']);
const TYPESCRIPT_CONSUMERS = new Set([
  'coding-standards',
  'test-runtime',
  'eslint-lint',
  'eslint-errors',
  'eslint-logging',
  'eslint-module-effects',
]);

const OXLINT_PACKAGES = ['oxlint', 'oxlint-tsgolint'];
const OXLINT_CONSUMERS = /^(?:eslint-|coding-standards$)/u;

export const ESLINT_PLUGIN_PACKAGES = [
  '@eslint/js',
  '@vitest/eslint-plugin',
  'eslint-plugin-formatjs',
  'eslint-plugin-functional',
  'eslint-plugin-jest',
  'eslint-plugin-jsx-a11y-x',
  'eslint-plugin-react-dom',
  'eslint-plugin-react-hooks',
  'eslint-plugin-react-web-api',
  'eslint-plugin-react-x',
  'eslint-plugin-regexp',
  'eslint-plugin-testing-library',
  'typescript-eslint',
];

function resolveEslintPluginVersions(resolve: Resolver): string {
  const plugins = ESLINT_PLUGIN_PACKAGES.map(
    (name) => `${name}@${resolve(name, { projectRoot: PACKAGE_ROOT }).version}`,
  );
  const manifest: unknown = JSON.parse(
    readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'),
  );
  const nitpickerVersion = fieldOf(manifest, 'version');
  return [...plugins, `nitpicker-plugin@${textOf(nitpickerVersion)}`].join(',');
}

function testRunnerVersion(
  liveProjectRoot: string,
  resolve: Resolver,
  configuredRunner: string | undefined,
): string {
  const { runner } = testRunnerFor(liveProjectRoot, configuredRunner);
  if (runner === 'node') {
    return `node@${process.versions.node}`;
  }
  const name = runnerPackages[runner] ?? runner;
  return `${name}@${resolve(name, { projectRoot: liveProjectRoot }).version}`;
}

export function testRunnerAnalyzerVersion(
  analyzerName: string,
  liveProjectRoot: string,
  {
    resolve = resolveTool,
    configuredRunner,
  }: { resolve?: Resolver; configuredRunner?: string | undefined } = {},
): string {
  const runnerVersion = testRunnerVersion(liveProjectRoot, resolve, configuredRunner);
  if (analyzerName !== 'mutation') {
    return runnerVersion;
  }
  const stryker = resolve('@stryker-mutator/core', { projectRoot: liveProjectRoot }).version;
  const native = resolve('@typescript/native', { projectRoot: PACKAGE_ROOT }).version;
  return `${stryker};${runnerVersion};@typescript/native@${native}`;
}

function typeScriptApiVersion(resolve: Resolver, bundled: boolean): string {
  return bundled
    ? `js-api-${resolve('typescript-js-api', { projectRoot: PACKAGE_ROOT }).version}`
    : resolve(TYPESCRIPT_TOOL, { projectRoot: PACKAGE_ROOT }).version;
}

export function resolveAnalyzerVersion(
  analyzerName: string,
  liveProjectRoot: string,
  {
    resolve = resolveTool,
    bundled = selectTypeScriptApi().bundled,
    installed = isToolInstalled,
  }: Partial<VersionSources & { installed: Installed }> = {},
): string {
  if (['coverage', 'mutation', 'test-console'].includes(analyzerName)) {
    return testRunnerAnalyzerVersion(analyzerName, liveProjectRoot, { resolve });
  }
  if (analyzerName === 'typescript-typecheck') {
    return typeCheckVersion(liveProjectRoot, { resolve, bundled, installed });
  }
  const toolName = analyzerName.startsWith('eslint-') ? 'eslint' : TOOL_BY_ANALYZER[analyzerName];
  if (toolName === undefined) {
    throw new Error(`No tool is configured for analyzer ${analyzerName}`);
  }

  const version = PACKAGE_ANALYZERS.has(analyzerName)
    ? typeScriptApiVersion(resolve, bundled)
    : resolve(toolName, { projectRoot: liveProjectRoot }).version;
  return withTypeScriptVersions({ analyzerName, toolName, version }, { resolve, bundled });
}

function typeCheckVersion(
  liveProjectRoot: string,
  { resolve, bundled, installed }: VersionSources & { installed: Installed },
): string {
  const project = installed(TYPESCRIPT_TOOL, { projectRoot: liveProjectRoot })
    ? resolve(TYPESCRIPT_TOOL, { projectRoot: liveProjectRoot }).version
    : 'none';
  const native = resolve('@typescript/native', { projectRoot: PACKAGE_ROOT }).version;
  return `${project};@typescript/native@${native};${typeScriptApiVersion(resolve, bundled)}`;
}

function withTypeScriptVersions(
  { analyzerName, toolName, version }: { analyzerName: string; toolName: string; version: string },
  { resolve, bundled }: VersionSources,
): string {
  if (DEPENDENCY_GRAPH_ANALYZERS.has(analyzerName)) {
    return `${version};typescript@${typeScriptApiVersion(resolve, bundled)}`;
  }
  if (!TYPESCRIPT_CONSUMERS.has(analyzerName)) {
    return version;
  }
  const base = `${toolName}@${version};typescript@${typeScriptApiVersion(resolve, bundled)};plugins:${resolveEslintPluginVersions(resolve)}`;
  return OXLINT_CONSUMERS.test(analyzerName) ? `${base};${resolveOxlintVersions(resolve)}` : base;
}

function resolveOxlintVersions(resolve: Resolver): string {
  return OXLINT_PACKAGES.map(
    (name) => `${name}@${resolve(name, { projectRoot: PACKAGE_ROOT }).version}`,
  ).join(',');
}
