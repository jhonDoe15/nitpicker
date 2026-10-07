import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createEslintAnalyzer } from '../../adapters/diff/eslint.mjs';
import { runQualityDiff } from './run-diff.mjs';

const toolRoot = path.resolve(import.meta.dirname, '../..');
const fakeEslintCliPath = path.join(import.meta.dirname, 'fixtures/fake-eslint-cli.mjs');
const eslintRunnerPath = path.join(toolRoot, 'adapters/diff/eslint-runner.mjs');
const temporaryRepositories = [];

afterEach(() => {
  for (const repositoryRoot of temporaryRepositories.splice(0)) {
    rmSync(repositoryRoot, { recursive: true, force: true });
  }
});

describe('ESLint differential adapters', () => {
  it('uses prepared baseline dependencies without replacing them with head dependencies', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-diff-'));
    temporaryRepositories.push(root);
    const projectRoot = path.join(root, 'base/project');
    const policyRoot = path.join(root, 'base/policy');
    writeFiles(projectRoot, {
      'package.json': '{"name":"fixture","version":"1.0.0"}\n',
      'node_modules/baseline-marker.txt': 'baseline dependencies\n',
      'src/main/source.ts': sourceWithDebugger('baseline'),
    });
    writeFiles(policyRoot, {
      ...policyFiles(),
      'package.json': '{"name":"fixture","version":"2.0.0"}\n',
    });

    const result = spawnSync(
      process.execPath,
      [
        eslintRunnerPath,
        '--analyzer-name',
        'eslint-lint',
        '--project-root',
        projectRoot,
        '--policy-root',
        policyRoot,
        '--tool-root',
        toolRoot,
        '--config',
        'eslint.config.mjs',
        '--pattern',
        'src/main/**/*.ts',
      ],
      { encoding: 'utf8' },
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).findings).toEqual([
      expect.objectContaining({ rule: 'no-debugger', path: 'src/main/source.ts' }),
    ]);
    expect(existsSync(path.join(projectRoot, 'node_modules/baseline-marker.txt'))).toBe(true);
    expect(existsSync(path.join(policyRoot, 'node_modules'))).toBe(false);
  });

  it('preserves unchanged, line-moved, and renamed findings while separating added and resolved findings', () => {
    const repository = createRepository({
      ...policyFiles(),
      'src/main/stable.ts': sourceWithDebugger('stable'),
      'src/main/resolved.ts': sourceWithDebugger('resolved'),
      'src/main/moved.ts': sourceWithDebugger('moved'),
      'src/main/old-name.ts': sourceWithDebugger('renamed'),
    });

    writeFiles(repository.root, {
      'src/main/resolved.ts': 'export function resolved() {}\n',
      'src/main/moved.ts': `const unrelated = true;\nvoid unrelated;\n\n${sourceWithDebugger('moved')}`,
      'src/main/added.ts': sourceWithDebugger('added'),
    });
    renameFile(repository.root, 'src/main/old-name.ts', 'src/main/new-name.ts');
    commit(repository.root, 'change ESLint findings');

    const report = compareRepository(repository, [fixtureAnalyzer('eslint-lint')]);

    expect(report.toolErrors).toEqual([]);
    expect(report.summary.overallStatus).toBe('completed');
    expect(report.summary.renamedPaths).toBe(1);
    expect(report.newFindings).toEqual([
      expect.objectContaining({ path: 'src/main/added.ts', rule: 'no-debugger', symbol: 'added' }),
    ]);
    expect(report.resolvedFindings).toEqual([
      expect.objectContaining({
        path: 'src/main/resolved.ts',
        rule: 'no-debugger',
        symbol: 'resolved',
      }),
    ]);
    expect(report.unchangedFindings).toHaveLength(3);
    expect(report.unchangedFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'src/main/stable.ts', symbol: 'stable' }),
        expect.objectContaining({
          path: 'src/main/moved.ts',
          symbol: 'moved',
          location: expect.objectContaining({ line: 5 }),
        }),
        expect.objectContaining({ path: 'src/main/new-name.ts', symbol: 'renamed' }),
      ]),
    );
  });

  it('runs all four command policies through the shared report pipeline', () => {
    const repository = createRepository({
      ...policyFiles(),
      'src/main/source.ts': 'export const clean = true;\n',
    });
    writeFiles(repository.root, {
      'src/main/source.ts': [
        'debugger;',
        'export function empty() {}',
        "console.log('fixture');",
        'export function unreachable() {',
        '  return;',
        '  debugger;',
        '}',
        '',
      ].join('\n'),
    });
    commit(repository.root, 'add policy findings');

    const report = compareRepository(repository, [
      fixtureAnalyzer('eslint-lint'),
      fixtureAnalyzer('eslint-errors', 'preset/eslint-config/errors.mjs'),
      fixtureAnalyzer('eslint-logging', 'preset/eslint-config/logging.mjs'),
      fixtureAnalyzer('eslint-module-effects', 'preset/eslint-config/module-effects.mjs'),
    ]);

    expect(report.toolErrors).toEqual([]);
    expect(report.summary.overallStatus).toBe('completed');
    expect(new Set(report.newFindings.map((finding) => finding.tool))).toEqual(
      new Set(['eslint-lint', 'eslint-errors', 'eslint-logging', 'eslint-module-effects']),
    );
    expect(report.newFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tool: 'eslint-lint', rule: 'no-debugger' }),
        expect.objectContaining({ tool: 'eslint-errors', rule: 'no-empty-function' }),
        expect.objectContaining({ tool: 'eslint-logging', rule: 'no-console' }),
        expect.objectContaining({ tool: 'eslint-module-effects', rule: 'no-unreachable' }),
      ]),
    );
  }, 120_000);

  it('uses semantic occurrence order for repeated identical findings', () => {
    const repository = createRepository({
      ...policyFiles(),
      'src/main/repeated.ts': [
        'export function repeated() {',
        '  debugger;',
        '  debugger;',
        '}',
        '',
      ].join('\n'),
    });
    writeFiles(repository.root, {
      'src/main/repeated.ts': [
        'const unrelated = true;',
        'void unrelated;',
        '',
        'export function repeated() {',
        '  debugger;',
        '  debugger;',
        '  debugger;',
        '}',
        '',
      ].join('\n'),
    });
    commit(repository.root, 'move and add a repeated finding');

    const report = compareRepository(repository, [fixtureAnalyzer('eslint-lint')]);

    expect(report.toolErrors).toEqual([]);
    expect(report.unchangedFindings).toHaveLength(2);
    expect(report.newFindings).toEqual([
      expect.objectContaining({
        identity: expect.stringContaining('occurrence:3'),
        symbol: 'repeated',
      }),
    ]);
  });

  it('preserves a finding when formatting adds trailing commas', () => {
    const repository = createRepository({
      ...policyFiles({ lintRule: 'no-new' }),
      'src/main/source.ts': [
        'class ManagedScheduler {',
        '  constructor(_options) {}',
        '}',
        'new ManagedScheduler({ enabled: true });',
        '',
      ].join('\n'),
    });
    writeFiles(repository.root, {
      'src/main/source.ts': [
        'class ManagedScheduler {',
        '  constructor(_options) {}',
        '}',
        'new ManagedScheduler({',
        '  enabled: true,',
        '});',
        '',
      ].join('\n'),
    });
    commit(repository.root, 'format existing finding');

    const report = compareRepository(repository, [fixtureAnalyzer('eslint-lint')]);

    expect(report.toolErrors).toEqual([]);
    expect(report.newFindings).toEqual([]);
    expect(report.resolvedFindings).toEqual([]);
    expect(report.unchangedFindings).toEqual([
      expect.objectContaining({ path: 'src/main/source.ts', rule: 'no-new' }),
    ]);
  });

  it('normalizes unused disable directives from ESLint JSON', { timeout: 60_000 }, () => {
    const repository = createRepository({
      ...policyFiles(),
      'src/main/source.ts': [
        '// eslint-disable-next-line no-console',
        "console.log('fixture');",
        '',
      ].join('\n'),
    });
    writeFiles(repository.root, { 'head.txt': 'head\n' });
    commit(repository.root, 'create head');

    const report = compareRepository(repository, [fixtureAnalyzer('eslint-lint')]);

    expect(report.toolErrors).toEqual([]);
    expect(report.unchangedFindings).toEqual([
      expect.objectContaining({ rule: 'eslint/unused-disable-directive' }),
    ]);
  });

  it('applies the head ESLint policy to both snapshots', () => {
    const repository = createRepository({
      ...policyFiles({ lintRule: 'no-debugger' }),
      'src/main/source.ts': "debugger;\nconsole.log('fixture');\n",
    });
    writeFiles(repository.root, policyFiles({ lintRule: 'no-console', withTypedProject: true }));
    commit(repository.root, 'change ESLint policy');

    const report = compareRepository(repository, [
      fixtureAnalyzer('eslint-lint', 'eslint.config.mjs', {
        policyFiles: ['tsconfig.quality.json'],
      }),
    ]);

    expect(report.toolErrors).toEqual([]);
    expect(report.newFindings).toEqual([]);
    expect(report.resolvedFindings).toEqual([]);
    expect(report.unchangedFindings).toEqual([
      expect.objectContaining({ rule: 'no-console', path: 'src/main/source.ts' }),
    ]);
  });

  it('accepts ESLint exit 1 only with valid JSON findings', () => {
    const repository = createRepository({
      ...policyFiles(),
      'src/main/source.ts': 'export const source = true;\n',
    });
    writeFiles(repository.root, { 'head.txt': 'head\n' });
    commit(repository.root, 'create head');

    const report = compareRepository(repository, [
      fixtureAnalyzer('eslint-lint', 'eslint.config.mjs', {
        eslintCliPath: fakeEslintCliPath,
      }),
    ]);

    expect(report.summary.overallStatus).toBe('completed');
    expect(report.unchangedFindings).toHaveLength(1);
    expect(report.toolErrors).toEqual([]);
  });

  it('uses dependencies prepared for a changed package manifest', () => {
    const packageJson = {
      name: 'fixture',
      version: '1.0.0',
      dependencies: { 'fixture-dependency': 'file:vendor/fixture-dependency' },
      scripts: { check: 'old' },
    };
    const packageRoot = mkdtempSync(path.join(tmpdir(), 'eslint-package-fixture-'));
    temporaryRepositories.push(packageRoot);
    writeFiles(packageRoot, {
      'package.json': `${JSON.stringify(packageJson)}\n`,
      'vendor/fixture-dependency/package.json': '{"name":"fixture-dependency","version":"1.0.0"}\n',
    });
    execFileSync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'],
      { cwd: packageRoot, encoding: 'utf8' },
    );
    const repository = createRepository({
      ...policyFiles(),
      'package.json': `${JSON.stringify(packageJson)}\n`,
      'package-lock.json': readFileSync(path.join(packageRoot, 'package-lock.json'), 'utf8'),
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
          environment: { QUALITY_DIFF_FAKE_ESLINT_MODE: mode },
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
    expect(result.stderr).toContain('must be inside a generated quality-diff worktree');
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
    expect(report.toolErrors[0].message).toContain(
      '--pattern must stay within the analyzed snapshot',
    );
  });
});

function createRepository(initialFiles) {
  const root = mkdtempSync(path.join(tmpdir(), 'eslint-quality-diff-'));
  temporaryRepositories.push(root);
  git(root, ['init', '-q', '--initial-branch=main']);
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
    'preset/eslint-config/errors.mjs': focusedConfig('no-empty-function'),
    'preset/eslint-config/logging.mjs': focusedConfig('no-console'),
    'preset/eslint-config/module-effects.mjs': focusedConfig('no-unreachable'),
  };
  if (withTypedProject) {
    files['tsconfig.quality.json'] = `${JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
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

function sourceWithDebugger(name) {
  return `export function ${name}() {\n  debugger;\n}\n`;
}

function writeFiles(repositoryRoot, files) {
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(repositoryRoot, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
}

function renameFile(repositoryRoot, oldPath, newPath) {
  const destination = path.join(repositoryRoot, newPath);
  mkdirSync(path.dirname(destination), { recursive: true });
  renameSync(path.join(repositoryRoot, oldPath), destination);
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
  });
}
