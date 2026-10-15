import {
  expectedOutput174_32,
  expectedOutput211_35,
} from '../../fixtures/expected-output/core-diff-diff-policy.mjs';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { runQualityDiff as runQualityDiffWithSubprocesses } from '../../comparison/run-diff.mjs';
import { runTasksInProcess } from '../../fixtures/in-process-analyzers.mjs';

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

    expect(report.newFindings).toEqual(expectedOutput174_32());
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
    expect(report.changedMetrics).toEqual(expectedOutput211_35());
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
});
