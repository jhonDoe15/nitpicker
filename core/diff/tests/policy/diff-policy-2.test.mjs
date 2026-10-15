import {
  expectedOutput351_80,
  expectedOutput410_31,
} from '../../fixtures/expected-output/core-diff-diff-policy.mjs';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { runCli as runCliWithSubprocesses } from '../../../cli.mjs';
import { runGit } from '../../git/repository/command.mjs';
import { REPORT_FILE_NAMES } from '../../reporting/reporters.mjs';
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

function compareRepository(repository, baseRef = repository.baseRef) {
  return runQualityDiff({
    repositoryRoot: repository.root,
    projectRelativePath: '.',
    headProjectRoot: repository.root,
    requestedBaseRef: baseRef,
    outputRoot: repository.outputRoot,
    analyzers: [fakeAnalyzer()],
  });
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

function worktreePaths(repositoryRoot) {
  const output = runGit(repositoryRoot, ['worktree', 'list', '--porcelain']);
  return output
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length));
}

function readJson(repositoryRoot, relativePath) {
  return JSON.parse(readFileSync(path.join(repositoryRoot, relativePath), 'utf8'));
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

describe('quality diff Git comparison', () => {
  it.each(['crash', 'malformed'])(
    'returns exit 2, writes tool errors, and removes worktrees after analyzer %s',
    (mode) => {
      const repository = createRepository({
        'quality-policy.json': policy(),
        'src/main/source.ts': 'export const source = true;\n',
      });
      commitFiles(
        repository.root,
        { 'quality-policy.json': policy({ mode }) },
        `configure ${mode}`,
      );
      const output = captureOutput();

      const exitCode = runCli({
        arguments_: ['--base', repository.baseRef, '--output', 'reports/quality/diff'],
        environment: {},
        currentProjectRoot: repository.root,
        analyzers: [fakeAnalyzer()],
        stdout: output.stdout,
        stderr: output.stderr,
        runTasks: undefined,
      });

      expect(exitCode).toBe(2);
      expect(readJson(repository.root, 'reports/quality/diff/tool-errors.json')).toHaveLength(2);
      expect(worktreePaths(repository.root)).toEqual([repository.root]);
    },
  );
  it('times out a hanging analyzer and removes both temporary worktrees', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/source.ts': 'export const source = true;\n',
    });
    commitFiles(repository.root, { 'quality-policy.json': policy({ mode: 'hang' }) }, 'hang');
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: ['--base', repository.baseRef, '--output', 'reports/quality/diff'],
      environment: {},
      currentProjectRoot: repository.root,
      analyzers: [fakeAnalyzer({ timeoutMs: 100 })],
      stdout: output.stdout,
      stderr: output.stderr,
      runTasks: undefined,
    });

    expect(exitCode).toBe(2);
    expect(readJson(repository.root, 'reports/quality/diff/tool-errors.json')).toEqual(
      expectedOutput351_80(),
    );
    expect(worktreePaths(repository.root)).toEqual([repository.root]);
  });
  it('removes stale reports before an invalid-ref failure', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/source.ts': 'export const source = true;\n',
    });
    writeFiles(
      repository.root,
      Object.fromEntries(
        REPORT_FILE_NAMES.map((reportFileName) => [
          `reports/quality/diff/${reportFileName}`,
          'stale\n',
        ]),
      ),
    );
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: ['--base', 'missing-ref'],
      environment: {},
      currentProjectRoot: repository.root,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(2);
    for (const reportFileName of REPORT_FILE_NAMES) {
      expect(existsSync(path.join(repository.outputRoot, reportFileName))).toBe(false);
    }
  });
  it('reports malformed analyzer configuration without leaking worktrees', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/source.ts': 'export const source = true;\n',
    });
    commitFiles(repository.root, { 'head.txt': 'head\n' }, 'head');

    const report = runQualityDiff({
      repositoryRoot: repository.root,
      projectRelativePath: '.',
      headProjectRoot: repository.root,
      requestedBaseRef: repository.baseRef,
      outputRoot: repository.outputRoot,
      analyzers: [null],
    });

    expect(report.summary.overallStatus).toBe('tool-error');
    expect(report.toolErrors).toEqual(expectedOutput410_31());
    expect(worktreePaths(repository.root)).toEqual([repository.root]);
  });
  it('removes temporary worktrees and writes every report after success', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/stable.ts': findingLine(finding({ identity: 'stable' })),
    });
    commitFiles(repository.root, { 'head.txt': 'head\n' }, 'head');

    const report = compareRepository(repository);

    expect(report.summary.overallStatus).toBe('completed');
    expect(worktreePaths(repository.root)).toEqual([repository.root]);
    for (const reportName of [
      'summary.json',
      'new-findings.json',
      'resolved-findings.json',
      'changed-metrics.json',
      'tool-errors.json',
      'report.txt',
      'report.junit.xml',
      'report.sarif',
    ]) {
      expect(existsSync(path.join(repository.outputRoot, reportName))).toBe(true);
    }
  });
  it('uses the head policy for both snapshots', () => {
    const repository = createRepository({
      'quality-policy.json': policy({ marker: 'OLD_QUALITY' }),
      'src/main/policy.ts': [
        findingLine(finding({ identity: 'old-policy' }), 'OLD_QUALITY'),
        findingLine(finding({ identity: 'head-policy' }), 'HEAD_QUALITY'),
      ].join(''),
    });
    commitFiles(
      repository.root,
      { 'quality-policy.json': policy({ marker: 'HEAD_QUALITY' }) },
      'change policy',
    );

    const report = compareRepository(repository);

    expect(report.unchangedFindings.map((entry) => entry.identity)).toEqual(['head-policy']);
    expect(report.newFindings).toEqual([]);
    expect(report.resolvedFindings).toEqual([]);
  });
  it('uses an explicit dependency from the head checkout for base analysis', () => {
    const repository = createRepository({
      'quality-policy.json': policy({
        markerDependency: 'fake-policy/marker.txt',
      }),
      'src/main/policy.ts': findingLine(
        finding({ identity: 'head-dependency' }),
        'DEPENDENCY_QUALITY',
      ),
    });
    commitFiles(repository.root, { 'head.txt': 'head\n' }, 'create head');
    writeFiles(repository.root, {
      'node_modules/fake-policy/marker.txt': 'DEPENDENCY_QUALITY\n',
    });

    const report = compareRepository(repository);

    expect(report.unchangedFindings.map((entry) => entry.identity)).toEqual(['head-dependency']);
    expect(report.newFindings).toEqual([]);
    expect(report.toolErrors).toEqual([]);
  });
  it('analyzes the committed head snapshot instead of live source changes', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/source.ts': 'export const source = true;\n',
    });
    commitFiles(repository.root, { 'head.txt': 'head\n' }, 'create head');
    writeFiles(repository.root, {
      'src/main/uncommitted.ts': findingLine(finding({ identity: 'uncommitted-source' })),
    });

    const report = compareRepository(repository);

    expect(report.newFindings).toEqual([]);
    expect(report.summary.headSha).toBe(git(repository.root, ['rev-parse', 'HEAD']).trim());
  });
});
describe('quality diff against the working tree', () => {
  it('reports a finding in an untracked file as new', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/stable.ts': findingLine(finding({ identity: 'stable' })),
    });
    writeFiles(repository.root, {
      'src/main/untracked.ts': findingLine(finding({ identity: 'untracked' })),
    });

    const report = compareWorkingTree(repository);

    expect(report.newFindings.map((entry) => entry.identity)).toEqual(['untracked']);
    expect(report.unchangedFindings.map((entry) => entry.identity)).toEqual(['stable']);
  });
});
