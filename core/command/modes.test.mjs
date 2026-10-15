import { createGitTemplate, copyGitTemplate } from '../diff/fixtures/git-repository.mjs';
import {
  expectedOutput61_31,
  expectedOutput62_31,
  expectedOutput83_31,
  expectedOutput107_31,
  expectedOutput131_31,
  expectedOutput154_31,
  expectedOutput155_31,
  expectedOutput156_31,
  expectedOutput175_31,
  expectedOutput213_33,
  expectedOutput253_31,
  expectedOutput264_32,
  expectedOutput280_31,
  expectedOutput308_31,
} from '../diff/fixtures/expected-output/core-cli.mjs';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, beforeAll, afterEach, expect, it } from 'vitest';
import { runCli as runCliWithSubprocesses } from '../cli.mjs';
import { runTasksInProcess } from '../diff/fixtures/in-process-analyzers.mjs';

// Most tests here are about diff, report and CLI logic, so the analyzer task graph and the fixture
// analyzers run in-process. A test that passes `runTasks: undefined` keeps the real
// analyzer-scheduler subprocess path (exit codes, invalid JSON, timeouts). Progress lines are
// discarded unless a test passes `progress`.
const discardedProgress = { write() {} };

const runCli = (options) =>
  runCliWithSubprocesses({ runTasks: runTasksInProcess, progress: discardedProgress, ...options });

const fakeAnalyzerPath = path.join(
  new URL('../', import.meta.url).pathname,
  'diff/fixtures/fake-analyzer.mjs',
);

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function createRepository(initialFiles) {
  const root = realpathSync(makeTemporaryRoot('nitpicker-cli-repo-'));
  copyGitTemplate(gitTemplate.root, root);
  writeFiles(root, {
    'package.json': '{"name":"cli-fixture","version":"1.0.0"}\n',
    'package-lock.json': '{"name":"cli-fixture","lockfileVersion":3}\n',
    '.gitignore': 'node_modules/\n',
    ...initialFiles,
  });
  commit(root, 'base');
  const baseSha = git(root, ['rev-parse', 'HEAD']).trim();
  const baseRef = 'comparison-base';
  git(root, ['branch', baseRef, baseSha]);
  return { root, baseSha, baseRef };
}

function fakeAnalyzer(name = 'fake-quality-analyzer') {
  return {
    name,
    version: '1.0.0',
    configurationHash: 'fixture-policy',
    exclusions: [],
    findingExitCodes: [1],
    createInvocation({ projectRoot, policyRoot, toolRoot }) {
      return {
        command: process.execPath,
        args: [
          fakeAnalyzerPath,
          '--root',
          projectRoot,
          '--policy-root',
          policyRoot,
          '--tool-root',
          toolRoot,
        ],
        cwd: policyRoot,
      };
    },
  };
}

function crashingAnalyzer() {
  return {
    ...fakeAnalyzer('crashing-analyzer'),
    createInvocation({ policyRoot }) {
      return {
        command: process.execPath,
        args: ['-e', 'process.exit(2)'],
        cwd: policyRoot,
      };
    },
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

function findingLine(value) {
  return `// QUALITY_FINDING ${JSON.stringify(value)}\n`;
}

function policy() {
  return `${JSON.stringify({ marker: 'QUALITY_FINDING' }, null, 2)}\n`;
}

function writeFiles(root, files) {
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
}

function commit(root, message) {
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', message]);
}

// Identity is passed per call, so fixture repositories need no `git config` spawns. The global and
// system config is ignored too: a developer's commit signing (`commit.gpgsign`) adds about 120 ms
// to every fixture commit, and the fixtures must not depend on it.
const gitFixtureEnvironment = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

function git(root, arguments_) {
  return execFileSync(
    'git',
    [
      '-c',
      'user.name=Nitpicker CLI Fixture',
      '-c',
      'user.email=nitpicker-cli@example.invalid',
      ...arguments_,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      env: gitFixtureEnvironment,
    },
  );
}

function makeTemporaryRoot(prefix) {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

function makeOutputRoot() {
  return path.join(makeTemporaryRoot('nitpicker-cli-output-'), 'reports');
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

const gitTemplate = { root: undefined };

beforeAll(() => {
  gitTemplate.root = createGitTemplate();
});

describe('nitpicker CLI', () => {
  it('fails comparison for a finding in an untracked file and identifies an argument base', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/clean.ts': 'export const clean = true;\n',
    });
    writeFiles(repository.root, {
      'src/main/untracked.ts': findingLine(finding({ identity: 'untracked-finding' })),
    });
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: ['--base', repository.baseRef, '--output', makeOutputRoot()],
      environment: {},
      currentProjectRoot: repository.root,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
      runTasks: undefined,
    });

    expect(exitCode).toBe(1);
    expect(output.stdoutText).toEqual(expectedOutput61_31({ repository }));
    expect(output.stdoutText).toEqual(expectedOutput62_31({ repository }));
    expect(output.stderrText).toBe('');
  });
  it('exits zero for a clean checkout with no new findings', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/clean.ts': 'export const clean = true;\n',
    });
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: ['--base', repository.baseRef, '--output', makeOutputRoot()],
      environment: {},
      currentProjectRoot: repository.root,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(0);
    expect(output.stdoutText).toEqual(expectedOutput83_31({ repository }));
    expect(output.stderrText).toBe('');
  });
  it('resolves the base from the remote HEAD when no base is given', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/clean.ts': 'export const clean = true;\n',
    });
    git(repository.root, ['update-ref', 'refs/remotes/origin/main', repository.baseSha]);
    git(repository.root, ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main']);
    git(repository.root, ['remote', 'add', 'origin', repository.root]);
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: ['--output', makeOutputRoot()],
      environment: {},
      currentProjectRoot: repository.root,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(0);
    expect(output.stdoutText).toEqual(expectedOutput107_31());
    expect(output.stderrText).toBe('');
  });
  it('works when the project root is passed through a symlink', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/clean.ts': 'export const clean = true;\n',
    });
    const symlinkRoot = path.join(makeTemporaryRoot('nitpicker-symlink-'), 'project');
    symlinkSync(repository.root, symlinkRoot, 'dir');
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: ['--base', repository.baseRef, '--output', makeOutputRoot()],
      environment: {},
      currentProjectRoot: symlinkRoot,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(0);
    expect(output.stderrText).toBe('');
    expect(output.stdoutText).toEqual(expectedOutput131_31({ repository }));
  });
  it('reports every finding in --all mode without a baseline', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/first.ts': findingLine(finding({ identity: 'first-finding' })),
      'src/main/second.ts': findingLine(
        finding({ identity: 'second-finding', rule: 'other-rule' }),
      ),
    });
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: ['--all', '--output', makeOutputRoot()],
      environment: {},
      currentProjectRoot: repository.root,
      snapshotAnalyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(1);
    expect(output.stdoutText).toEqual(expectedOutput154_31());
    expect(output.stdoutText).toEqual(expectedOutput155_31());
    expect(output.stdoutText).toEqual(expectedOutput156_31());
    expect(output.stderrText).toBe('');
  });
  it('returns a tool error for a crashing --all analyzer', () => {
    const repository = createRepository({
      'quality-policy.json': JSON.stringify({ marker: 'QUALITY_FINDING', mode: 'crash' }),
    });
    const output = captureOutput();
    expect(
      runCli({
        arguments_: ['--all', '--output', makeOutputRoot()],
        currentProjectRoot: repository.root,
        analyzers: [fakeAnalyzer()],
        stdout: output.stdout,
        stderr: output.stderr,
        runTasks: undefined,
      }),
    ).toBe(2);
    expect(output.stdoutText).toEqual(expectedOutput175_31());
  });
  describe.each([
    ['comparison', (repository) => ['--base', repository.baseRef]],
    ['--all', () => ['--all']],
  ])('exit code in %s mode', (mode, modeArguments) => {
    const run = ({ withFinding, withToolError }) => {
      const repository = createRepository({
        'quality-policy.json': policy(),
        'src/main/clean.ts': 'export const clean = true;\n',
      });
      if (withFinding) {
        writeFiles(repository.root, {
          'src/main/new.ts': findingLine(finding({ identity: 'new-finding' })),
        });
        if (mode === 'comparison') {
          commit(repository.root, 'add finding');
        }
      }
      const output = captureOutput();
      const analyzers = [fakeAnalyzer(), ...(withToolError ? [crashingAnalyzer()] : [])];
      const exitCode = runCli({
        arguments_: [...modeArguments(repository), '--output', makeOutputRoot()],
        environment: {},
        currentProjectRoot: repository.root,
        analyzers,
        snapshotAnalyzers: analyzers,
        stdout: output.stdout,
        stderr: output.stderr,
        runTasks: undefined,
      });
      return { exitCode, output };
    };
    it('exits 1 for findings plus a tool error and still lists the error', () => {
      const { exitCode, output } = run({ withFinding: true, withToolError: true });
      expect(exitCode).toBe(1);
      expect(output.stdoutText).toEqual(expectedOutput213_33({ mode }));
    });
    it('exits 2 for a tool error without findings', () => {
      expect(run({ withFinding: false, withToolError: true }).exitCode).toBe(2);
    });
    it('exits 1 for findings without a tool error', () => {
      expect(run({ withFinding: true, withToolError: false }).exitCode).toBe(1);
    });
    it('exits 0 when clean', () => {
      expect(run({ withFinding: false, withToolError: false }).exitCode).toBe(0);
    });
  });
  it('supports --all analyzer selection and rule drill-down', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/existing.ts': findingLine(finding({ rule: 'match-me' })),
    });
    const output = captureOutput();
    expect(
      runCli({
        arguments_: [
          '--all',
          '--analyzer',
          'fake-quality-analyzer',
          '--rule',
          'match-me',
          '--output',
          makeOutputRoot(),
        ],
        currentProjectRoot: repository.root,
        analyzers: [fakeAnalyzer()],
        stdout: output.stdout,
        stderr: output.stderr,
      }),
    ).toBe(1);
    expect(output.stdoutText).toEqual(expectedOutput253_31());
    const unknown = captureOutput();
    expect(
      runCli({
        arguments_: ['--all', '--analyzer', 'unknown'],
        currentProjectRoot: repository.root,
        analyzers: [fakeAnalyzer()],
        stdout: unknown.stdout,
        stderr: unknown.stderr,
      }),
    ).toBe(2);
    expect(unknown.stderrText).toEqual(expectedOutput264_32());
  });
  it('runs the packaged prettier preset against a consumer snapshot', () => {
    const repository = createRepository({
      'src/main/example.ts': 'export const example=1\n',
      'tests/placeholder.ts': 'export const placeholder = true;\n',
    });
    const output = captureOutput();
    const exitCode = runCli({
      arguments_: ['--all', '--analyzer', 'prettier-format', '--output', makeOutputRoot()],
      currentProjectRoot: repository.root,
      stdout: output.stdout,
      stderr: output.stderr,
    });
    expect(exitCode, output.stdoutText + output.stderrText).toBe(1);
    expect(output.stdoutText).toEqual(expectedOutput280_31());
    expect(output.stderrText).toBe('');
  });
  it('keeps staged and unstaged checkout state intact in --all mode', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/staged.ts': 'export const staged = false;\n',
    });
    writeFiles(repository.root, {
      'src/main/staged.ts': 'export const staged = true;\n',
    });
    git(repository.root, ['add', 'src/main/staged.ts']);
    writeFiles(repository.root, {
      'src/main/staged.ts': 'export const staged = 2;\n',
      'src/main/untracked.ts': findingLine(finding({ identity: 'untracked-all' })),
    });
    const beforeStatus = git(repository.root, ['status', '--porcelain=v1']);
    const beforeIndex = git(repository.root, ['ls-files', '--stage']);
    const output = captureOutput();
    const exitCode = runCli({
      arguments_: ['--all', '--output', makeOutputRoot()],
      currentProjectRoot: repository.root,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });
    expect(exitCode).toBe(1);
    expect(output.stdoutText).toEqual(expectedOutput308_31());
    expect(git(repository.root, ['status', '--porcelain=v1'])).toBe(beforeStatus);
    expect(git(repository.root, ['ls-files', '--stage'])).toBe(beforeIndex);
  });
});
