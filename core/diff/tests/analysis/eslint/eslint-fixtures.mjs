import { copyGitTemplate, createGitTemplate } from '../../../fixtures/git-repository.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll } from 'vitest';
import { createEslintAnalyzer } from '../../../../../languages/typescript/adapters/eslint/analyzer.mjs';
import { fileURLToPath } from 'node:url';

export const toolRoot = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)), '../..');

export const fakeEslintCliPath = path.join(
  fileURLToPath(new URL('../../../', import.meta.url)),
  'fixtures/fake-eslint-cli.mjs',
);

const replayEslintCliPath = path.join(
  fileURLToPath(new URL('../../../', import.meta.url)),
  'fixtures/replay-eslint-cli.mjs',
);

const recordedEslintReportsPath = path.join(
  fileURLToPath(new URL('../../../', import.meta.url)),
  'fixtures/eslint-recorded-reports.json',
);

export const temporaryRepositories = [];

const gitTemplate = { root: undefined };

export function registerEslintRepositoryLifecycle() {
  beforeAll(() => {
    gitTemplate.root = createGitTemplate();
  });
  afterEach(() => {
    for (const repositoryRoot of temporaryRepositories.splice(0)) {
      rmSync(repositoryRoot, { recursive: true, force: true });
    }
  });
}

export function createRepository(initialFiles) {
  const root = mkdtempSync(path.join(tmpdir(), 'eslint-quality-diff-'));
  temporaryRepositories.push(root);
  copyGitTemplate(gitTemplate.root, root);
  git(root, ['config', 'user.name', 'ESLint Diff Fixture']);
  git(root, ['config', 'user.email', 'eslint-diff@example.invalid']);
  writeFiles(root, initialFiles);
  commit(root, 'base');
  const baseRef = 'comparison-base';
  git(root, ['branch', baseRef, 'HEAD']);
  return {
    root,
    baseRef,
    outputRoot: path.join(root, 'reports/quality/diff'),
  };
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

export function writeFiles(repositoryRoot, files) {
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(repositoryRoot, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
}

export function renameFile(repositoryRoot, oldPath, newPath) {
  const destination = path.join(repositoryRoot, newPath);
  mkdirSync(path.dirname(destination), { recursive: true });
  renameSync(path.join(repositoryRoot, oldPath), destination);
}

export function commit(repositoryRoot, message) {
  git(repositoryRoot, ['add', '-A']);
  git(repositoryRoot, ['commit', '-q', '-m', message]);
}

function git(repositoryRoot, arguments_) {
  return execFileSync('git', arguments_, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  });
}
