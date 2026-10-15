import {
  expectedOutput705_31,
  expectedOutput706_31,
  expectedOutput707_31,
  expectedOutput711_82,
  expectedOutput738_31,
  expectedOutput739_31,
  expectedOutput740_31,
} from '../../fixtures/expected-output/core-diff-diff-policy.mjs';

import { execFileSync } from 'node:child_process';

import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';

import { tmpdir } from 'node:os';

import path from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { compareFindings } from '../../comparison/compare.mjs';

import { parseDrillDownOptions } from '../../comparison/cli.mjs';

import { runCli as runCliWithSubprocesses } from '../../../cli.mjs';

import { parseFinding } from '../../comparison/finding-schema.mjs';

import { canonicalCycleIdentity } from '../../comparison/fingerprint.mjs';

import { runQualityDiff as runQualityDiffWithSubprocesses } from '../../comparison/run-diff.mjs';

import { runTasksInProcess } from '../../fixtures/in-process-analyzers.mjs';

// Most tests here are about diff, report and CLI logic, so the analyzer task graph and the fixture
// analyzers run in-process. A test that passes `runTasks: undefined` keeps the real
// analyzer-scheduler subprocess path (exit codes, invalid JSON, timeouts).
const runCli = (options) => runCliWithSubprocesses({ runTasks: runTasksInProcess, ...options });

const runQualityDiff = (options) =>
  runQualityDiffWithSubprocesses({ runTasks: runTasksInProcess, ...options });

const fakeAnalyzerPath = path.join(
  new URL('../../', import.meta.url).pathname,
  'fixtures/fake-analyzer.mjs',
);

const temporaryRepositories = [];

let templateRoot;

const baseRepositories = new Map();

const COMPARISON_BASE_REF = 'comparison-base';

const COMMON_EXCLUSIONS = [
  '**/generated/**',
  '**/*.d.ts',
  '**/node_modules/**',
  '**/reports/**',
  '**/coverage/**',
  '**/dist/**',
  '**/build/**',
  '**/target/**',
];

afterEach(() => {
  for (const repositoryRoot of temporaryRepositories.splice(0)) {
    rmSync(repositoryRoot, { recursive: true, force: true });
  }
});

afterAll(() => {
  for (const { root } of baseRepositories.values()) {
    rmSync(root, { recursive: true, force: true });
  }
  baseRepositories.clear();
  if (templateRoot !== undefined) {
    rmSync(templateRoot, { recursive: true, force: true });
    templateRoot = undefined;
  }
});

/**
 * Git setup is shared: one template repository per file (init, identity, and signing and
 * maintenance settings that would otherwise cost extra processes per commit), and one base
 * repository per distinct set of initial files. Each test copies a base repository directory,
 * `.git` included, instead of spawning git again. Copies are never mutated; tests that need
 * changes commit them into their own copy.
 */
function createRepositoryTemplate() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'quality-diff-template-')));
  git(root, ['init', '-q', '--initial-branch=main']);
  git(root, ['config', 'user.name', 'Quality Diff Fixture']);
  git(root, ['config', 'user.email', 'quality-diff@example.invalid']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  git(root, ['config', 'maintenance.auto', 'false']);
  git(root, ['config', 'gc.auto', '0']);
  return root;
}

beforeAll(() => {
  templateRoot = createRepositoryTemplate();
});

function repositoryTemplate() {
  return templateRoot;
}

function baseRepositoryFor(initialFiles) {
  const key = JSON.stringify(initialFiles);
  let base = baseRepositories.get(key);
  if (base === undefined) {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'quality-diff-base-')));
    cpSync(path.join(repositoryTemplate(), '.git'), path.join(root, '.git'), { recursive: true });
    writeFiles(root, initialFiles);
    commit(root, 'base');
    const baseSha = git(root, ['rev-parse', 'HEAD']).trim();
    git(root, ['branch', COMPARISON_BASE_REF, baseSha]);
    base = { root, baseSha };
    baseRepositories.set(key, base);
  }
  return base;
}

function createRepository(initialFiles) {
  const base = baseRepositoryFor(initialFiles);
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'quality-diff-repo-')));
  temporaryRepositories.push(root);
  cpSync(base.root, root, { recursive: true });
  return {
    root,
    baseSha: base.baseSha,
    baseRef: COMPARISON_BASE_REF,
    outputRoot: path.join(root, 'reports/quality/diff'),
  };
}

function compareWorkingTree(repository, baseRef = repository.baseRef) {
  return runQualityDiff({
    repositoryRoot: repository.root,
    projectRelativePath: '.',
    headProjectRoot: repository.root,
    requestedBaseRef: baseRef,
    outputRoot: repository.outputRoot,
    analyzers: [fakeAnalyzer()],
    includeWorkingTree: true,
  });
}

function fakeAnalyzer(overrides = {}) {
  return {
    name: 'fake-quality-analyzer',
    version: '1.0.0',
    configurationHash: 'fixture-policy',
    exclusions: COMMON_EXCLUSIONS,
    findingExitCodes: [1],
    createInvocation({ projectRoot, policyRoot, liveProjectRoot }) {
      return {
        command: process.execPath,
        args: [
          fakeAnalyzerPath,
          '--root',
          projectRoot,
          '--policy-root',
          policyRoot,
          '--tool-root',
          liveProjectRoot,
        ],
        cwd: policyRoot,
      };
    },
    ...overrides,
  };
}

function finding(overrides = {}) {
  return {
    tool: 'fake-quality-analyzer',
    rule: 'fixture-rule',
    identity: 'fixture-identity',
    message: 'Fixture finding',
    classification: 'enforceable',
    ...overrides,
  };
}

function findingLine(value, marker = 'QUALITY_FINDING') {
  return `// ${marker} ${JSON.stringify(value)}\n`;
}

function policy(overrides = {}) {
  return `${JSON.stringify({ marker: 'QUALITY_FINDING', ...overrides }, null, 2)}\n`;
}

function commitFiles(repositoryRoot, files, message) {
  writeFiles(repositoryRoot, files);
  commit(repositoryRoot, message);
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

function captureOutput() {
  const output = { stdoutText: '', stderrText: '' };
  output.stdout = {
    write(value) {
      output.stdoutText += value;
    },
  };
  output.stderr = {
    write(value) {
      output.stderrText += value;
    },
  };
  return output;
}

describe('quality diff against the working tree', () => {
  it('reports an unstaged edit and ignores ignored files', () => {
    const repository = createRepository({
      '.gitignore': 'scratch/\n',
      'quality-policy.json': policy(),
      'src/main/edited.ts': findingLine(finding({ identity: 'removed' })),
    });
    writeFiles(repository.root, {
      'src/main/edited.ts': findingLine(finding({ identity: 'added' })),
      'scratch/ignored.ts': findingLine(finding({ identity: 'ignored' })),
    });

    const report = compareWorkingTree(repository);

    expect(report.newFindings.map((entry) => entry.identity)).toEqual(['added']);
    expect(report.resolvedFindings.map((entry) => entry.identity)).toEqual(['removed']);
  });
  it('follows an uncommitted rename', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/old-name.ts': findingLine(finding({ identity: 'renamed', identityFromPath: true })),
    });
    renameFile(repository.root, 'src/main/old-name.ts', 'src/main/new-name.ts');

    const report = compareWorkingTree(repository);

    expect(report.summary.renamedPaths).toBe(1);
    expect(report.unchangedFindings.map((entry) => entry.path)).toEqual(['src/main/new-name.ts']);
    expect(report.newFindings).toEqual([]);
  });
  it('compares with HEAD itself when the checkout is clean', () => {
    const repository = createRepository({ 'quality-policy.json': policy() });
    commitFiles(repository.root, { 'src/main/later.ts': 'export {};\n' }, 'later');

    const report = compareWorkingTree(repository);

    expect(report.summary.headSha).toBe(git(repository.root, ['rev-parse', 'HEAD']).trim());
  });
  it('leaves the index, branches, and files untouched', () => {
    const repository = createRepository({
      '.gitignore': 'reports/\n',
      'quality-policy.json': policy(),
      'src/main/staged.ts': 'export const before = 1;\n',
    });
    writeFiles(repository.root, {
      'src/main/staged.ts': 'export const after = 1;\n',
      'src/main/untracked.ts': 'export {};\n',
    });
    git(repository.root, ['add', 'src/main/staged.ts']);
    writeFiles(repository.root, {
      'src/main/staged.ts': 'export const unstaged = 1;\n',
    });
    const statusBefore = git(repository.root, ['status', '--porcelain']);
    const stagedBefore = git(repository.root, ['diff', '--cached']);
    const refsBefore = git(repository.root, ['for-each-ref']);

    compareWorkingTree(repository);

    expect(git(repository.root, ['status', '--porcelain'])).toBe(statusBefore);
    expect(git(repository.root, ['diff', '--cached'])).toBe(stagedBefore);
    expect(git(repository.root, ['for-each-ref'])).toBe(refsBefore);
    expect(readFileSync(path.join(repository.root, 'src/main/staged.ts'), 'utf8')).toBe(
      'export const unstaged = 1;\n',
    );
  });
});
describe('quality diff identities and arguments', () => {
  it('canonicalizes equivalent cycle traversal order', () => {
    const first = canonicalCycleIdentity([
      { source: 'src/a.ts', target: 'src/b.ts' },
      { source: 'src/b.ts', target: 'src/c.ts' },
      { source: 'src/c.ts', target: 'src/a.ts' },
    ]);
    const second = canonicalCycleIdentity([
      { source: './src/c.ts', target: './src/a.ts' },
      { source: './src/a.ts', target: './src/b.ts' },
      { source: './src/b.ts', target: './src/c.ts' },
    ]);

    expect(first).toBe(second);
  });
  it('does not match different metric names under one descriptive identity', () => {
    const base = finding({
      path: 'src/main/fixture.ts',
      classification: 'descriptive',
      metric: { name: 'fanIn', value: 2 },
    });
    const head = { ...base, metric: { name: 'fanOut', value: 2 } };

    const comparison = compareFindings({
      baseFindings: [base],
      headFindings: [head],
    });

    expect(comparison.changedMetrics).toEqual([]);
    expect(comparison.newFindings).toHaveLength(1);
    expect(comparison.resolvedFindings).toHaveLength(1);
  });
  it('rejects analyzer paths outside the analyzed project', () => {
    expect(() => parseFinding(finding({ path: '../outside.ts' }))).toThrow(
      /must stay within the analyzed project/,
    );
  });
  it('separates repeatable drill-down flags from the arguments resolveBaseRef sees', () => {
    expect(
      parseDrillDownOptions([
        '--analyzer',
        'eslint-lint',
        '--base',
        'origin/master',
        '--rule',
        'no-explicit-any',
        '--analyzer',
        'entry-points',
      ]),
    ).toEqual({
      analyzerNames: ['eslint-lint', 'entry-points'],
      ruleFilters: ['no-explicit-any'],
      shardCount: undefined,
      shardIndex: undefined,
      deferExit: false,
      remainingArguments: ['--base', 'origin/master'],
    });
  });
  it('parses complete shard coordinates and deferred worker exits', () => {
    expect(
      parseDrillDownOptions([
        '--base',
        'origin/master',
        '--shard-count',
        '3',
        '--shard-index',
        '1',
        '--defer-exit',
      ]),
    ).toEqual({
      analyzerNames: [],
      ruleFilters: [],
      shardCount: 3,
      shardIndex: 1,
      deferExit: true,
      remainingArguments: ['--base', 'origin/master'],
    });
  });
  it('requires complete shard coordinates and rejects explicit analyzer overlap', () => {
    expect(() => parseDrillDownOptions(['--shard-count', '3'])).toThrow(
      /shard-count and --shard-index must be provided together/,
    );
    expect(() =>
      parseDrillDownOptions(['--analyzer', 'coverage', '--shard-count', '3', '--shard-index', '0']),
    ).toThrow(/--analyzer cannot be combined/);
  });
  it('requires a value for analyzer, rule, and shard flags', () => {
    expect(() => parseDrillDownOptions(['--analyzer'])).toThrow(/--analyzer requires a value/);
    expect(() => parseDrillDownOptions(['--rule'])).toThrow(/--rule requires a value/);
    expect(() => parseDrillDownOptions(['--shard-count'])).toThrow(
      /--shard-count requires a value/,
    );
  });
  it('exits zero when the branch introduces no new enforceable findings', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/stable.ts': findingLine(finding({ identity: 'stable' })),
    });
    commitFiles(repository.root, { 'head.txt': 'head\n' }, 'head');
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: ['--base', repository.baseRef, '--output', 'reports/quality/diff'],
      environment: {},
      currentProjectRoot: repository.root,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(0);
    expect(output.stdoutText).toEqual(expectedOutput705_31({ repository }));
    expect(output.stdoutText).toEqual(expectedOutput706_31({ repository }));
    expect(output.stdoutText).toEqual(expectedOutput707_31({ repository, path }));
    expect(output.stdoutText).not.toContain('Per-tool counts:');
    expect(readFileSync(path.join(repository.outputRoot, 'report.txt'), 'utf8')).toEqual(
      expectedOutput711_82(),
    );
  });
  it('exits nonzero when the branch introduces a new enforceable finding', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/stable.ts': findingLine(finding({ identity: 'stable' })),
    });
    commitFiles(
      repository.root,
      { 'src/main/new.ts': findingLine(finding({ identity: 'introduced' })) },
      'introduce finding',
    );
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: ['--base', repository.baseRef, '--output', 'reports/quality/diff'],
      environment: {},
      currentProjectRoot: repository.root,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(1);
    expect(output.stdoutText).toEqual(expectedOutput738_31({ repository }));
    expect(output.stdoutText).toEqual(expectedOutput739_31({ repository }));
    expect(output.stdoutText).toEqual(expectedOutput740_31({ repository }));
    expect(output.stdoutText).not.toContain('Per-tool counts:');
  });
});
