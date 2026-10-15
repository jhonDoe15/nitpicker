import {
  expectedOutput809_31,
  expectedOutput838_31,
  expectedOutput839_82,
  expectedOutput862_31,
  expectedOutput896_31,
  expectedOutput897_31,
  expectedOutput914_31,
} from '../../fixtures/expected-output/core-diff-diff-policy.mjs';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
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
import { runTasksInProcess } from '../../fixtures/in-process-analyzers.mjs';

// Most tests here are about diff, report and CLI logic, so the analyzer task graph and the fixture
// analyzers run in-process. A test that passes `runTasks: undefined` keeps the real
// analyzer-scheduler subprocess path (exit codes, invalid JSON, timeouts).
const runCli = (options) => runCliWithSubprocesses({ runTasks: runTasksInProcess, ...options });

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

describe('quality diff identities and arguments', () => {
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
    expect(output.stdoutText).toEqual(expectedOutput809_31({ repository }));
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
    expect(output.stdoutText).toEqual(expectedOutput838_31({ repository }));
    expect(readJson(repository.root, 'reports/quality/diff/summary.json').tools).toEqual(
      expectedOutput839_82(),
    );
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
    expect(output.stderrText).toEqual(expectedOutput862_31());
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
    expect(output.stdoutText).toEqual(expectedOutput896_31({ repository }));
    expect(output.stdoutText).toEqual(expectedOutput897_31({ repository }));
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
    expect(output.stderrText).toEqual(expectedOutput914_31());
  });
});
