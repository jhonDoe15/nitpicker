import { createGitTemplate, copyGitTemplate } from '../../fixtures/git-repository.mjs';

import {
  expectedOutput403_27,
  expectedOutput423_42,
} from '../../fixtures/expected-output/core-diff-eslint-diff-policy.mjs';

import { execFileSync, spawnSync } from 'node:child_process';

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';

import { tmpdir } from 'node:os';

import path from 'node:path';

import { beforeAll, afterEach, describe, expect, it } from 'vitest';

import { createEslintAnalyzer } from '../../../../languages/typescript/adapters/eslint/analyzer.mjs';

import { runQualityDiff } from '../../comparison/run-diff.mjs';

const toolRoot = path.resolve(new URL('../../', import.meta.url).pathname, '../..');

const fakeEslintCliPath = path.join(
  new URL('../../', import.meta.url).pathname,
  'fixtures/fake-eslint-cli.mjs',
);

// What `npm install --package-lock-only` writes for the fixture package.json used by the
// changed-manifest test, inlined so the test does not start npm.
const fixtureDependencyLockfile = `${JSON.stringify(
  {
    name: 'fixture',
    version: '1.0.0',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: 'fixture',
        version: '1.0.0',
        dependencies: { 'fixture-dependency': 'file:vendor/fixture-dependency' },
      },
      'node_modules/fixture-dependency': { resolved: 'vendor/fixture-dependency', link: true },
      'vendor/fixture-dependency': { version: '1.0.0' },
    },
  },
  null,
  2,
)}\n`;

const eslintRunnerPath = path.join(toolRoot, 'languages/typescript/adapters/eslint-runner.mjs');

const temporaryRepositories = [];

afterEach(() => {
  for (const repositoryRoot of temporaryRepositories.splice(0)) {
    rmSync(repositoryRoot, { recursive: true, force: true });
  }
});

function createRepository(initialFiles) {
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

function compareRepository(repository, analyzers) {
  return runQualityDiff({
    repositoryRoot: repository.root,
    projectRelativePath: '.',
    headProjectRoot: toolRoot,
    requestedBaseRef: repository.baseRef,
    outputRoot: repository.outputRoot,
    analyzers,
  });
}

function fixtureAnalyzer(name, configRelativePath = 'eslint.config.mjs', overrides = {}) {
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

function dependencyAnalyzer() {
  return {
    name: 'dependency-analyzer',
    version: 'fixture',
    configurationHash: 'fixture',
    exclusions: [],
    requiresDependencies: true,
    createInvocation({ toolRoot }) {
      return {
        command: process.execPath,
        args: ['-e', 'process.stdout.write(JSON.stringify({ findings: [] }))'],
        cwd: toolRoot,
      };
    },
  };
}

function policyFiles({ lintRule = 'no-debugger', withTypedProject = false } = {}) {
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
        // The policy rules are syntactic; without lib files the typed program is created
        // without parsing the default library, which halves the typed ESLint run.
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

function writeFiles(repositoryRoot, files) {
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(repositoryRoot, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
}

function commit(repositoryRoot, message) {
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

const gitTemplate = { root: undefined };

beforeAll(() => {
  gitTemplate.root = createGitTemplate();
});

describe('ESLint differential adapters', () => {
  it('uses dependencies prepared for a changed package manifest', () => {
    const packageJson = {
      name: 'fixture',
      version: '1.0.0',
      dependencies: { 'fixture-dependency': 'file:vendor/fixture-dependency' },
      scripts: { check: 'old' },
    };
    const repository = createRepository({
      ...policyFiles(),
      'package.json': `${JSON.stringify(packageJson)}\n`,
      'package-lock.json': fixtureDependencyLockfile,
      'vendor/fixture-dependency/package.json': '{"name":"fixture-dependency","version":"1.0.0"}\n',
      'src/main/source.ts': 'export const source = true;\n',
    });
    writeFiles(repository.root, {
      'package.json': `${JSON.stringify({
        ...packageJson,
        scripts: { check: 'new' },
      })}\n`,
    });
    commit(repository.root, 'change package manifest');

    const report = compareRepository(repository, [
      fixtureAnalyzer('eslint-lint', 'eslint.config.mjs', {
        eslintCliPath: fakeEslintCliPath,
      }),
      dependencyAnalyzer(),
    ]);

    expect(report.summary.overallStatus).toBe('completed');
    expect(report.toolErrors).toEqual([]);
  });
  it.each(['malformed', 'configuration-error', 'crash', 'timeout'])(
    'reports ESLint %s as a tool error',
    (mode) => {
      const repository = createRepository({
        ...policyFiles(),
        'src/main/source.ts': 'export const source = true;\n',
      });
      writeFiles(repository.root, { 'head.txt': 'head\n' });
      commit(repository.root, 'create head');

      const report = compareRepository(repository, [
        fixtureAnalyzer('eslint-lint', 'eslint.config.mjs', {
          eslintCliPath: fakeEslintCliPath,
          eslintTimeoutMs: mode === 'timeout' ? 100 : undefined,
          environment: { NITPICKER_DIFF_FAKE_ESLINT_MODE: mode },
        }),
      ]);

      expect(report.summary.overallStatus).toBe('tool-error');
      expect(report.toolErrors).toHaveLength(2);
      expect(report.newFindings).toEqual([]);
    },
  );
  it('rejects direct filesystem roots outside generated worktrees', () => {
    const untrustedRoot = mkdtempSync(path.join(tmpdir(), 'eslint-untrusted-root-'));
    temporaryRepositories.push(untrustedRoot);
    const result = spawnSync(
      process.execPath,
      [
        eslintRunnerPath,
        '--analyzer-name',
        'eslint-lint',
        '--project-root',
        untrustedRoot,
        '--policy-root',
        untrustedRoot,
        '--tool-root',
        toolRoot,
        '--config',
        'eslint.config.mjs',
        '--pattern',
        'src/main/**/*.ts',
      ],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(2);
    expect(result.stderr).toEqual(expectedOutput403_27());
    expect(existsSync(path.join(untrustedRoot, 'node_modules'))).toBe(false);
  });
  it('rejects analyzer patterns that can leave the snapshot', () => {
    const repository = createRepository({
      ...policyFiles(),
      'src/main/source.ts': 'export const source = true;\n',
    });
    writeFiles(repository.root, { 'head.txt': 'head\n' });
    commit(repository.root, 'create head');

    const report = compareRepository(repository, [
      fixtureAnalyzer('eslint-lint', 'eslint.config.mjs', {
        patterns: ['../outside.ts'],
      }),
    ]);

    expect(report.summary.overallStatus).toBe('tool-error');
    expect(report.toolErrors).toHaveLength(2);
    expect(report.toolErrors[0].message).toEqual(expectedOutput423_42());
  });
});
