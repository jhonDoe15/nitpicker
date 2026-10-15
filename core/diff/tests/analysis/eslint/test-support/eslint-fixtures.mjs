import path from 'node:path';
import { createEslintAnalyzer } from '../../../../../../languages/typescript/adapters/eslint/analyzer.mjs';
import { PACKAGE_ROOT } from '../../../../../tooling/tool-resolution.mjs';
import { useGitFixtures } from '../../../../git/test-support/git-repository.mjs';

export const toolRoot = PACKAGE_ROOT;

const fixturesRoot = path.resolve(import.meta.dirname, '../../../../fixtures');

export const fakeEslintCliPath = path.join(fixturesRoot, 'fake-eslint-cli.mjs');

const replayEslintCliPath = path.join(fixturesRoot, 'replay-eslint-cli.mjs');

const recordedEslintReportsPath = path.join(fixturesRoot, 'eslint-recorded-reports.json');

const COMPARISON_BASE_REF = 'comparison-base';

export function useEslintFixtures() {
  const git = useGitFixtures();

  function createRepository(initialFiles) {
    const { root, baseRef } = git.createGitRepository(initialFiles, {
      prefix: 'eslint-quality-diff-',
      baseRef: COMPARISON_BASE_REF,
    });
    return { root, baseRef, outputRoot: path.join(root, 'reports/quality/diff') };
  }

  return { temporaryRoot: git.temporaryRoot, createRepository };
}

export function comparisonOptions(repository, analyzers) {
  return {
    repositoryRoot: repository.root,
    projectRelativePath: '.',
    headProjectRoot: toolRoot,
    requestedBaseRef: repository.baseRef,
    outputRoot: repository.outputRoot,
    analyzers,
  };
}

export function fixtureAnalyzer(name, configRelativePath = 'eslint.config.mjs', overrides = {}) {
  return createEslintAnalyzer({
    name,
    version: 'fixture',
    configurationHash: 'fixture',
    exclusions: [],
    configRelativePath,
    patterns: ['src/main/**/*.ts'],
    ...overrides,
  });
}

export function recordedEslintAnalyzer(
  name,
  configRelativePath = 'eslint.config.mjs',
  overrides = {},
) {
  return fixtureAnalyzer(name, configRelativePath, {
    eslintCliPath: replayEslintCliPath,
    environment: { NITPICKER_DIFF_REPLAY_RECORDINGS: recordedEslintReportsPath },
    ...overrides,
  });
}

export function policyFiles({ lintRule = 'no-debugger', withTypedProject = false } = {}) {
  const files = {
    'eslint.config.mjs': [
      "import tseslint from 'typescript-eslint';",
      '',
      'export default tseslint.config({',
      "  files: ['src/main/**/*.ts'],",
      withTypedProject
        ? "  languageOptions: { parser: tseslint.parser, parserOptions: { project: './tsconfig.quality.json', tsconfigRootDir: import.meta.dirname } },"
        : '  languageOptions: { parser: tseslint.parser },',
      `  rules: { '${lintRule}': 'error' },`,
      '});',
      '',
    ].join('\n'),
    'languages/typescript/preset/eslint-config/policies/errors.config.mjs':
      focusedConfig('no-empty-function'),
    'languages/typescript/preset/eslint-config/policies/logging.config.mjs':
      focusedConfig('no-console'),
    'languages/typescript/preset/eslint-config/policies/module-effects.config.mjs':
      focusedConfig('no-unreachable'),
  };
  if (withTypedProject) {
    files['tsconfig.quality.json'] = `${JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        noLib: true,
        types: [],
      },
      include: ['src/main/**/*.ts'],
    })}\n`;
  }
  return files;
}

function focusedConfig(rule) {
  return [
    'export default [',
    '  {',
    "    files: ['src/main/**/*.ts'],",
    `    rules: { '${rule}': 'error' },`,
    '  },',
    '];',
    '',
  ].join('\n');
}

export function sourceWithDebugger(name) {
  return `export function ${name}() {\n  debugger;\n}\n`;
}
