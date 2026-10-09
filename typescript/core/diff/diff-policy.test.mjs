import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { compareFindings } from './compare.mjs';
import { parseDrillDownOptions } from './cli.mjs';
import { runCli as runCliWithSubprocesses } from '../cli.mjs';
import { parseFinding } from './finding-schema.mjs';
import { canonicalCycleIdentity } from './fingerprint.mjs';
import { runGit } from './git.mjs';
import { REPORT_FILE_NAMES } from './reporters.mjs';
import { runQualityDiff as runQualityDiffWithSubprocesses } from './run-diff.mjs';
import { runTasksInProcess } from './fixtures/in-process-analyzers.mjs';

// Most tests here are about diff, report and CLI logic, so the analyzer task graph and the fixture
// analyzers run in-process. A test that passes `runTasks: undefined` keeps the real
// analyzer-scheduler subprocess path (exit codes, invalid JSON, timeouts).
const runCli = (options) => runCliWithSubprocesses({ runTasks: runTasksInProcess, ...options });
const runQualityDiff = (options) =>
  runQualityDiffWithSubprocesses({ runTasks: runTasksInProcess, ...options });

const fakeAnalyzerPath = path.join(import.meta.dirname, 'fixtures/fake-analyzer.mjs');
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

describe('quality diff Git comparison', () => {
  it('uses the merge base rather than the requested branch tip', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/stable.ts': findingLine(finding({ identity: 'stable' })),
    });
    const mergeBaseSha = repository.baseSha;
    git(repository.root, ['checkout', '-q', '-b', 'upstream']);
    commitFiles(repository.root, { 'upstream-only.txt': 'upstream\n' }, 'upstream change');
    git(repository.root, ['checkout', '-q', 'main']);
    commitFiles(repository.root, { 'head-only.txt': 'head\n' }, 'head change');

    const report = compareRepository(repository, 'upstream');

    expect(report.summary.mergeBaseSha).toBe(mergeBaseSha);
    expect(report.unchangedFindings).toHaveLength(1);
    expect(report.newFindings).toEqual([]);
  });

  it('separates unchanged, added, and removed findings', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/findings.ts': [
        findingLine(finding({ identity: 'stable' })),
        findingLine(finding({ identity: 'removed' })),
      ].join(''),
    });
    commitFiles(
      repository.root,
      {
        'src/main/findings.ts': [
          findingLine(finding({ identity: 'stable' })),
          findingLine(finding({ identity: 'added' })),
        ].join(''),
      },
      'change findings',
    );

    const report = compareRepository(repository);

    expect(report.unchangedFindings.map((entry) => entry.identity)).toEqual(['stable']);
    expect(report.newFindings.map((entry) => entry.identity)).toEqual(['added']);
    expect(report.resolvedFindings.map((entry) => entry.identity)).toEqual(['removed']);
  });

  it('ignores line movement when stable identity is unchanged', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/moved.ts': findingLine(finding({ identity: 'moved' })),
    });
    commitFiles(
      repository.root,
      {
        'src/main/moved.ts': `const unrelated = true;\n\n${findingLine(
          finding({ identity: 'moved' }),
        )}`,
      },
      'insert unrelated lines',
    );

    const report = compareRepository(repository);

    expect(report.unchangedFindings).toHaveLength(1);
    expect(report.unchangedFindings[0].location.line).toBe(3);
    expect(report.newFindings).toEqual([]);
    expect(report.resolvedFindings).toEqual([]);
  });

  it('maps a renamed base path to its head path', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/old-name.ts': findingLine(finding({ identity: 'renamed', identityFromPath: true })),
    });
    renameFile(repository.root, 'src/main/old-name.ts', 'src/main/new-name.ts');
    commit(repository.root, 'rename source');

    const report = compareRepository(repository);

    expect(report.summary.renamedPaths).toBe(1);
    expect(report.unchangedFindings).toHaveLength(1);
    expect(report.unchangedFindings[0].path).toBe('src/main/new-name.ts');
    expect(report.unchangedFindings[0].identity).toBe('path:src/main/new-name.ts');
    expect(report.newFindings).toEqual([]);
    expect(report.resolvedFindings).toEqual([]);
  });

  it('reports a graph-wide finding at an unchanged source location', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/source.ts': 'export const source = true;\n',
      'dependency.graph': '',
    });
    const graphFinding = finding({
      identity: 'src/main/source.ts->src/main/forbidden.ts',
      path: 'src/main/source.ts',
      rule: 'forbidden-dependency',
    });
    commitFiles(
      repository.root,
      {
        'dependency.graph': `src/main/source.ts -> src/main/forbidden.ts ${findingLine(graphFinding)}`,
      },
      'add forbidden dependency edge',
    );

    const report = compareRepository(repository);

    expect(report.newFindings).toEqual([
      expect.objectContaining({
        rule: 'forbidden-dependency',
        path: 'src/main/source.ts',
      }),
    ]);
    expect(git(repository.root, ['diff', '--name-only', repository.baseSha, 'HEAD']).trim()).toBe(
      'dependency.graph',
    );
  });

  it('reports descriptive value changes only as metric deltas', () => {
    const baseMetric = finding({
      identity: 'module-fan-out',
      classification: 'descriptive',
      metric: { name: 'fanOut', value: 2 },
    });
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/metric.ts': findingLine(baseMetric),
    });
    commitFiles(
      repository.root,
      {
        'src/main/metric.ts': findingLine({
          ...baseMetric,
          metric: { name: 'fanOut', value: 5 },
        }),
      },
      'change metric',
    );

    const report = compareRepository(repository);

    expect(report.newFindings).toEqual([]);
    expect(report.resolvedFindings).toEqual([]);
    expect(report.unchangedFindings).toEqual([]);
    expect(report.changedMetrics).toEqual([
      expect.objectContaining({
        metric: 'fanOut',
        baseValue: 2,
        headValue: 5,
        delta: 3,
      }),
    ]);
  });

  it('excludes non-production and generated paths', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/selected.ts': 'export const selected = true;\n',
    });
    const excludedFinding = finding({ identity: 'excluded' });
    const excludedFiles = [
      'src/main/generated/a.ts',
      'src/main/types/a.d.ts',
      'node_modules/package/a.js',
      'reports/a.txt',
      'coverage/a.txt',
      'dist/a.js',
      'build/a.js',
      'target/a.js',
    ];
    commitFiles(
      repository.root,
      Object.fromEntries(excludedFiles.map((filePath) => [filePath, findingLine(excludedFinding)])),
      'add excluded findings',
    );

    const report = compareRepository(repository);

    expect(report.newFindings).toEqual([]);
    expect(report.resolvedFindings).toEqual([]);
    expect(report.unchangedFindings).toEqual([]);
    expect(report.summary.exclusions).toEqual(COMMON_EXCLUSIONS.slice().sort());
  });

  it('fails for an invalid base ref', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/source.ts': 'export const source = true;\n',
    });

    expect(() => compareRepository(repository, 'missing-ref')).toThrow(
      /Cannot resolve base ref "missing-ref"/,
    );
  });

  it('fails when disconnected histories have no merge base', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/base.ts': 'export const base = true;\n',
    });
    git(repository.root, ['remote', 'add', 'upstream', 'https://example.invalid/example.git']);
    git(repository.root, ['update-ref', 'refs/remotes/upstream/base', repository.baseSha]);
    git(repository.root, ['checkout', '-q', '--orphan', 'unrelated']);
    removeWorkingTreeFiles(repository.root);
    writeFiles(repository.root, {
      'quality-policy.json': policy(),
      'src/main/head.ts': 'export const head = true;\n',
    });
    commit(repository.root, 'unrelated head');

    expect(() => compareRepository(repository, 'upstream/base')).toThrow(
      /git fetch 'upstream' 'base'/,
    );
  });

  it('accepts valid findings output with a nonzero analyzer exit', () => {
    const repository = createRepository({
      'quality-policy.json': policy({ exitCodeWhenFindings: 1 }),
      'src/main/base.ts': 'export const base = true;\n',
    });
    commitFiles(
      repository.root,
      {
        'src/main/new.ts': findingLine(finding({ identity: 'nonzero-finding' })),
      },
      'add finding',
    );

    const report = compareRepository(repository);

    expect(report.summary.overallStatus).toBe('completed');
    expect(report.newFindings).toHaveLength(1);
    expect(report.toolErrors).toEqual([]);
  });

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
    expect(readJson(repository.root, 'reports/quality/diff/tool-errors.json')).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('timed out after 100 ms'),
      }),
      expect.objectContaining({
        message: expect.stringContaining('timed out after 100 ms'),
      }),
    ]);
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
    expect(report.toolErrors).toEqual([
      expect.objectContaining({ tool: 'unknown-analyzer-0', snapshot: 'base' }),
      expect.objectContaining({ tool: 'unknown-analyzer-0', snapshot: 'head' }),
    ]);
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
    expect(output.stdoutText).toContain('Quality gate summary');
    expect(output.stdoutText).toContain('✓ No new enforceable violations');
    expect(output.stdoutText).toContain('Full diagnostics: reports/quality/diff/report.txt');
    expect(output.stdoutText).not.toContain('Per-tool counts:');
    expect(readFileSync(path.join(repository.outputRoot, 'report.txt'), 'utf8')).toContain(
      'Per-tool counts:',
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
    expect(output.stdoutText).toContain('✖ 1 new enforceable violation');
    expect(output.stdoutText).toContain('fake-quality-analyzer/fixture-rule');
    expect(output.stdoutText).toContain('src/main/new.ts');
    expect(output.stdoutText).not.toContain('Per-tool counts:');
  });

  it('defers a shard finding exit after writing its report', () => {
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
      arguments_: [
        '--base',
        repository.baseRef,
        '--output',
        'reports/quality/diff/0',
        '--shard-count',
        '1',
        '--shard-index',
        '0',
        '--defer-exit',
      ],
      environment: {},
      currentProjectRoot: repository.root,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(0);
    expect(readJson(repository.root, 'reports/quality/diff/0/new-findings.json')).toHaveLength(1);
  });

  it('does not fail on a new finding that is merely descriptive', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/stable.ts': findingLine(finding({ identity: 'stable' })),
    });
    commitFiles(
      repository.root,
      {
        'src/main/new.ts': findingLine(
          finding({
            identity: 'introduced-metric',
            classification: 'descriptive',
            metric: { name: 'fanIn', value: 3 },
          }),
        ),
      },
      'introduce descriptive finding',
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

    expect(exitCode).toBe(0);
    expect(output.stdoutText).toContain('✓ No new enforceable violations');
    expect(output.stdoutText).not.toContain('introduced-metric');
  });

  it('restricts the run to a named analyzer with --analyzer', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/source.ts': 'export const source = true;\n',
    });
    commitFiles(repository.root, { 'head.txt': 'head\n' }, 'head');
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: [
        '--base',
        repository.baseRef,
        '--output',
        'reports/quality/diff',
        '--analyzer',
        'fake-quality-analyzer',
      ],
      environment: {},
      currentProjectRoot: repository.root,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(0);
    expect(output.stdoutText).toContain('✓ No new enforceable violations');
    expect(readJson(repository.root, 'reports/quality/diff/summary.json').tools).toEqual([
      expect.objectContaining({ name: 'fake-quality-analyzer' }),
    ]);
  });

  it('rejects an unknown --analyzer name instead of silently running everything', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/source.ts': 'export const source = true;\n',
    });
    commitFiles(repository.root, { 'head.txt': 'head\n' }, 'head');
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: ['--base', repository.baseRef, '--analyzer', 'does-not-exist'],
      environment: {},
      currentProjectRoot: repository.root,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(2);
    expect(output.stderrText).toContain('Unknown --analyzer: does-not-exist');
  });

  it('prints a drill-down section for findings matching --rule', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/stable.ts': findingLine(finding({ identity: 'stable', rule: 'match-me' })),
    });
    commitFiles(
      repository.root,
      {
        'src/main/new.ts': findingLine(finding({ identity: 'introduced', rule: 'match-me' })),
      },
      'introduce finding',
    );
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: [
        '--base',
        repository.baseRef,
        '--output',
        'reports/quality/diff',
        '--rule',
        'match-me',
      ],
      environment: {},
      currentProjectRoot: repository.root,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(1);
    expect(output.stdoutText).toContain('Findings matching --rule match-me:');
    expect(output.stdoutText).toContain('fake-quality-analyzer/match-me');
  });

  it('does not report success before real analyzer adapters are configured', () => {
    const output = captureOutput();
    const repository = createRepository({ 'src/service.ts': 'export const service = 1;\n' });

    const exitCode = runCli({
      arguments_: ['--base', 'origin/master'],
      environment: {},
      currentProjectRoot: repository.root,
      analyzers: [],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(2);
    expect(output.stderrText).toContain('No quality analyzers are configured');
  });
});

/**
 * Git setup is shared: one template repository per file (init, identity, and signing and
 * maintenance settings that would otherwise cost extra processes per commit), and one base
 * repository per distinct set of initial files. Each test copies a base repository directory,
 * `.git` included, instead of spawning git again. Copies are never mutated; tests that need
 * changes commit them into their own copy.
 */
function repositoryTemplate() {
  if (templateRoot === undefined) {
    templateRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'quality-diff-template-')));
    git(templateRoot, ['init', '-q', '--initial-branch=main']);
    git(templateRoot, ['config', 'user.name', 'Quality Diff Fixture']);
    git(templateRoot, ['config', 'user.email', 'quality-diff@example.invalid']);
    git(templateRoot, ['config', 'commit.gpgsign', 'false']);
    git(templateRoot, ['config', 'maintenance.auto', 'false']);
    git(templateRoot, ['config', 'gc.auto', '0']);
  }
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

function removeWorkingTreeFiles(repositoryRoot) {
  for (const entry of readdirSync(repositoryRoot)) {
    if (entry !== '.git') {
      rmSync(path.join(repositoryRoot, entry), {
        recursive: true,
        force: true,
      });
    }
  }
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
