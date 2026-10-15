import { createGitTemplate, copyGitTemplate } from '../../fixtures/git-repository.mjs';
import {
  expectedOutput84_48,
  expectedOutput113_32,
  expectedOutput116_37,
  expectedOutput124_38,
  expectedOutput177_32,
  expectedOutput217_32,
  expectedOutput256_38,
  expectedOutput276_38,
  expectedOutput298_38,
} from '../../fixtures/expected-output/core-diff-eslint-diff-policy.mjs';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
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

const replayEslintCliPath = path.join(
  new URL('../../', import.meta.url).pathname,
  'fixtures/replay-eslint-cli.mjs',
);

const recordedEslintReportsPath = path.join(
  new URL('../../', import.meta.url).pathname,
  'fixtures/eslint-recorded-reports.json',
);

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

// Compare-policy tests replay ESLint reports recorded from real ESLint runs (see
// fixtures/eslint-recorded-reports.json) instead of starting ESLint; the replay only matches the
// exact snapshot each report was recorded from.
function recordedEslintAnalyzer(name, configRelativePath = 'eslint.config.mjs', overrides = {}) {
  return fixtureAnalyzer(name, configRelativePath, {
    eslintCliPath: replayEslintCliPath,
    environment: { NITPICKER_DIFF_REPLAY_RECORDINGS: recordedEslintReportsPath },
    ...overrides,
  });
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
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  });
}

const gitTemplate = { root: undefined };

beforeAll(() => {
  gitTemplate.root = createGitTemplate();
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
    expect(JSON.parse(result.stdout).findings).toEqual(expectedOutput84_48());
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

    const report = compareRepository(repository, [recordedEslintAnalyzer('eslint-lint')]);

    expect(report.toolErrors).toEqual([]);
    expect(report.summary.overallStatus).toBe('completed');
    expect(report.summary.renamedPaths).toBe(1);
    expect(report.newFindings).toEqual(expectedOutput113_32());
    expect(report.resolvedFindings).toEqual(expectedOutput116_37());
    expect(report.unchangedFindings).toHaveLength(3);
    expect(report.unchangedFindings).toEqual(expectedOutput124_38());
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
      recordedEslintAnalyzer('eslint-lint'),
      recordedEslintAnalyzer(
        'eslint-errors',
        'languages/typescript/preset/eslint-config/policies/errors.config.mjs',
      ),
      recordedEslintAnalyzer(
        'eslint-logging',
        'languages/typescript/preset/eslint-config/policies/logging.config.mjs',
      ),
      recordedEslintAnalyzer(
        'eslint-module-effects',
        'languages/typescript/preset/eslint-config/policies/module-effects.config.mjs',
      ),
    ]);

    expect(report.toolErrors).toEqual([]);
    expect(report.summary.overallStatus).toBe('completed');
    expect(new Set(report.newFindings.map((finding) => finding.tool))).toEqual(
      new Set(['eslint-lint', 'eslint-errors', 'eslint-logging', 'eslint-module-effects']),
    );
    expect(report.newFindings).toEqual(expectedOutput177_32());
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

    const report = compareRepository(repository, [recordedEslintAnalyzer('eslint-lint')]);

    expect(report.toolErrors).toEqual([]);
    expect(report.unchangedFindings).toHaveLength(2);
    expect(report.newFindings).toEqual(expectedOutput217_32());
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

    // One compare-policy test keeps running the real ESLint CLI, as the end-to-end check that
    // the recorded reports stand for what ESLint does.
    const report = compareRepository(repository, [fixtureAnalyzer('eslint-lint')]);

    expect(report.toolErrors).toEqual([]);
    expect(report.newFindings).toEqual([]);
    expect(report.resolvedFindings).toEqual([]);
    expect(report.unchangedFindings).toEqual(expectedOutput256_38());
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

    const report = compareRepository(repository, [recordedEslintAnalyzer('eslint-lint')]);

    expect(report.toolErrors).toEqual([]);
    expect(report.unchangedFindings).toEqual(expectedOutput276_38());
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
    expect(report.unchangedFindings).toEqual(expectedOutput298_38());
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
});
