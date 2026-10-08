import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from './cli.mjs';

const fakeAnalyzerPath = path.join(import.meta.dirname, 'diff/fixtures/fake-analyzer.mjs');
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
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
    });

    expect(exitCode).toBe(1);
    expect(output.stdoutText).toContain(`Base: ${repository.baseRef} (argument)`);
    expect(output.stdoutText).toContain('untracked.ts');
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
    expect(output.stdoutText).toContain('✓ No new enforceable violations');
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
    expect(output.stdoutText).toContain('Base: origin/main (remote-head)');
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
    expect(output.stdoutText).toContain('✓ No new enforceable violations');
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
    expect(output.stdoutText).toContain('Enforceable findings: 2');
    expect(output.stdoutText).toContain('first.ts');
    expect(output.stdoutText).toContain('second.ts');
    expect(output.stderrText).toBe('');
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
    expect(output.stdoutText).toContain('src/main/example.ts');
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
    expect(output.stdoutText).toContain('untracked.ts');
    expect(git(repository.root, ['status', '--porcelain=v1'])).toBe(beforeStatus);
    expect(git(repository.root, ['ls-files', '--stage'])).toBe(beforeIndex);
  });

  it('rejects projects without a package lock before analysis', () => {
    const repository = createRepository({});
    rmSync(path.join(repository.root, 'package-lock.json'));
    const output = captureOutput();
    expect(
      runCli({
        currentProjectRoot: repository.root,
        arguments_: ['--all'],
        stdout: output.stdout,
        stderr: output.stderr,
      }),
    ).toBe(2);
    expect(output.stderrText).toContain('package-lock.json is required');
  });

  it('rejects workspace projects before analysis', () => {
    const repository = createRepository({
      'package.json': '{"workspaces":["packages/*"]}\n',
    });
    const output = captureOutput();
    expect(
      runCli({
        currentProjectRoot: repository.root,
        arguments_: ['--all'],
        stdout: output.stdout,
        stderr: output.stderr,
      }),
    ).toBe(2);
    expect(output.stderrText).toContain('npm workspaces are unsupported');
  });

  it('rejects --all combined with --base', () => {
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: ['--all', '--base', 'x'],
      environment: {},
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(2);
    expect(output.stderrText.startsWith('nitpicker failed:')).toBe(true);
  });

  it('prints the single-command usage for --help', () => {
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: ['--help'],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(0);
    expect(output.stdoutText.startsWith('Usage: nitpicker')).toBe(true);
    expect(output.stderrText).toBe('');
  });

  it('runs when launched through a symlinked bin', () => {
    const binPath = path.join(makeTemporaryRoot('nitpicker-cli-bin-'), 'nitpicker');
    symlinkSync(path.join(import.meta.dirname, 'cli.mjs'), binPath);

    const stdout = execFileSync(process.execPath, [binPath, '--help'], {
      encoding: 'utf8',
    });

    expect(stdout.startsWith('Usage: nitpicker')).toBe(true);
  });
});

function createRepository(initialFiles) {
  const root = realpathSync(makeTemporaryRoot('nitpicker-cli-repo-'));
  git(root, ['init', '-q', '--initial-branch=main']);
  git(root, ['config', 'user.name', 'Nitpicker CLI Fixture']);
  git(root, ['config', 'user.email', 'nitpicker-cli@example.invalid']);
  writeFiles(root, {
    'package.json': '{"name":"cli-fixture","version":"1.0.0"}\n',
    'package-lock.json': '{"name":"cli-fixture","lockfileVersion":3}\n',
    ...initialFiles,
  });
  commit(root, 'base');
  const baseSha = git(root, ['rev-parse', 'HEAD']).trim();
  const baseRef = 'comparison-base';
  git(root, ['branch', baseRef, baseSha]);
  return { root, baseSha, baseRef };
}

function fakeAnalyzer() {
  return {
    name: 'fake-quality-analyzer',
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

function git(root, arguments_) {
  return execFileSync('git', arguments_, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
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
