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
const TYPESCRIPT_CONSUMERS = new Set([
  'coding-standards',
  'test-runtime',
  'eslint-lint',
  'eslint-errors',
  'eslint-logging',
  'eslint-module-effects',
]);

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

export function resolveAnalyzerVersion(analyzerName, liveProjectRoot, resolve = resolveTool) {
  const toolName = analyzerName.startsWith('eslint-') ? 'eslint' : TOOL_BY_ANALYZER[analyzerName];
  if (toolName === undefined) {
    throw new Error(`No tool is configured for analyzer ${analyzerName}`);
  }

  const toolRoot = analyzerName === 'structure' ? PACKAGE_ROOT : liveProjectRoot;
  const version = resolve(toolName, { projectRoot: toolRoot }).version;
  if (!TYPESCRIPT_CONSUMERS.has(analyzerName)) {
    return version;
  }

  const typeScriptVersion = resolve('typescript', {
    projectRoot: PACKAGE_ROOT,
  }).version;
  return `${toolName}@${version};typescript@${typeScriptVersion};plugins:${resolveEslintPluginVersions(resolve)}`;
}
