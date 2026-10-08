import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
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
      }),
    ).toBe(2);
    expect(output.stdoutText).toContain('Status: tool-error');
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
    expect(output.stdoutText).toContain('Findings matching --rule match-me:');
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
    expect(unknown.stderrText).toContain('Unknown --analyzer: unknown');
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

  it('fixes changed ESLint and Prettier violations before comparing without touching unchanged files or the index', () => {
    const repository = createRepository({
      'src/main/changed.ts': 'export const changed = 1;\n',
      'src/main/format.mjs': 'export const format = 1;\n',
      'src/main/unchanged.ts': 'export const unchanged=1\n',
      'tests/placeholder.ts': 'export const placeholder = true;\n',
    });
    symlinkSync(
      path.join(import.meta.dirname, '../node_modules'),
      path.join(repository.root, 'node_modules'),
      'dir',
    );
    writeFiles(repository.root, {
      'src/main/changed.ts': 'export let changed=2;\n',
    });
    git(repository.root, ['add', 'src/main/changed.ts']);
    writeFiles(repository.root, {
      'src/main/changed.ts': 'export let changed=3;\n',
      'src/main/format.mjs': 'export const format=2\n',
    });
    const indexBefore = git(repository.root, ['ls-files', '--stage']);
    const output = captureOutput();
    const exitCode = runCli({
      arguments_: [
        '--fix',
        '--base',
        repository.baseRef,
        '--analyzer',
        'eslint-lint',
        '--analyzer',
        'prettier-format',
        '--output',
        makeOutputRoot(),
      ],
      currentProjectRoot: repository.root,
      environment: {},
      stdout: output.stdout,
      stderr: output.stderr,
    });
    expect(exitCode, output.stdoutText + output.stderrText).toBe(0);
    expect(readFileSync(path.join(repository.root, 'src/main/changed.ts'), 'utf8')).toBe(
      'export const changed = 3;\n',
    );
    expect(readFileSync(path.join(repository.root, 'src/main/format.mjs'), 'utf8')).toBe(
      'export const format = 2;\n',
    );
    expect(readFileSync(path.join(repository.root, 'src/main/unchanged.ts'), 'utf8')).toBe(
      'export const unchanged=1\n',
    );
    expect(git(repository.root, ['ls-files', '--stage'])).toBe(indexBefore);
    expect(output.stdoutText).toMatch(
      /Fixed files:\nsrc\/main\/changed.ts\nsrc\/main\/format.mjs\nBase:/,
    );
  });

  it('continues remaining fixers and comparison when a fixer fails', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/changed.ts': 'export const changed = 1;\n',
      'src/main/format.mjs': 'export const format = 1;\n',
      'tests/placeholder.ts': 'export const placeholder = true;\n',
    });
    symlinkSync(
      path.join(import.meta.dirname, '../node_modules'),
      path.join(repository.root, 'node_modules'),
      'dir',
    );
    writeFiles(repository.root, {
      'src/main/changed.ts': 'export let changed=3;\n',
      'src/main/format.mjs': 'export const format=2\n',
    });
    const output = captureOutput();
    const outputRoot = makeOutputRoot();
    const exitCode = runCli({
      arguments_: ['--fix', '--base', repository.baseRef, '--output', outputRoot],
      currentProjectRoot: repository.root,
      environment: {},
      analyzers: [fakeAnalyzer()],
      executeFixCommand({ operation }) {
        if (operation === 'eslint-fix') {
          return { status: 2, stderr: 'fixture ESLint failure' };
        }
      },
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(2);
    expect(readFileSync(path.join(repository.root, 'src/main/format.mjs'), 'utf8')).toBe(
      'export const format = 2;\n',
    );
    expect(output.stdoutText).toContain(`Base: ${repository.baseRef} (argument)`);
    expect(output.stdoutText).toContain('Quality gate summary');
    expect(output.stdoutText).toContain('eslint-fix');
    expect(output.stderrText).toBe('');
    expect(JSON.parse(readFileSync(path.join(outputRoot, 'summary.json'), 'utf8'))).toEqual(
      expect.objectContaining({ overallStatus: 'tool-error' }),
    );
    expect(JSON.parse(readFileSync(path.join(outputRoot, 'tool-errors.json'), 'utf8'))).toEqual(
      expect.arrayContaining([expect.objectContaining({ tool: 'eslint-fix', snapshot: 'fix' })]),
    );
  });

  it('uses a renamed file base path for Prettier fix eligibility', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/legacy.json':
        '[\n{"legacy":true},\n{"legacy":true},\n{"legacy":true},\n{"legacy":true}\n]\n',
    });
    git(repository.root, ['mv', 'src/main/legacy.json', 'src/main/legacy.md']);
    writeFiles(repository.root, {
      'src/main/legacy.md':
        '[\n{"legacy":true},\n{"legacy":true},\n{"legacy":true},\n{"legacy":true}\n]\n\n#  Heading\n\nSome   text\n',
    });
    const output = captureOutput();
    let checkedBasePath;
    const exitCode = runCli({
      arguments_: ['--fix', '--base', repository.baseRef, '--output', makeOutputRoot()],
      currentProjectRoot: repository.root,
      environment: {},
      analyzers: [fakeAnalyzer()],
      executeFixCommand({ operation, input }) {
        if (operation === 'prettier-base-check') {
          checkedBasePath = JSON.parse(input).files[0].filePath;
        }
      },
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(0);
    expect(readFileSync(path.join(repository.root, 'src/main/legacy.md'), 'utf8')).toBe(
      '[\n{"legacy":true},\n{"legacy":true},\n{"legacy":true},\n{"legacy":true}\n]\n\n#  Heading\n\nSome   text\n',
    );
    expect(checkedBasePath).toBe(path.join(repository.root, 'src/main/legacy.json'));
    expect(output.stdoutText).toContain('Fixed files:\n(none)\n');
    expect(output.stderrText).toBe('');
  });

  it('formats new and base-clean changes but not edited legacy formatting', () => {
    const repository = createRepository({
      'src/main/clean.mjs': 'export const clean = true;\n',
      'src/main/legacy.mjs': 'export const legacy=true\n',
      'tests/placeholder.ts': 'export const placeholder = true;\n',
    });
    writeFiles(repository.root, {
      'src/main/clean.mjs': 'export const clean=false\n',
      'src/main/legacy.mjs': 'export const legacy=false\n',
      'src/main/new.mjs': 'export const fresh=true\n',
    });
    const output = captureOutput();
    const exitCode = runCli({
      arguments_: [
        '--fix',
        '--base',
        repository.baseRef,
        '--analyzer',
        'prettier-format',
        '--output',
        makeOutputRoot(),
      ],
      currentProjectRoot: repository.root,
      environment: {},
      stdout: output.stdout,
      stderr: output.stderr,
    });
    expect(exitCode, output.stdoutText + output.stderrText).toBe(1);
    expect(readFileSync(path.join(repository.root, 'src/main/clean.mjs'), 'utf8')).toBe(
      'export const clean = false;\n',
    );
    expect(readFileSync(path.join(repository.root, 'src/main/new.mjs'), 'utf8')).toBe(
      'export const fresh = true;\n',
    );
    expect(readFileSync(path.join(repository.root, 'src/main/legacy.mjs'), 'utf8')).toBe(
      'export const legacy=false\n',
    );
    expect(output.stdoutText).toMatch(
      /Fixed files:\nsrc\/main\/clean.mjs\nsrc\/main\/new.mjs\nBase:/,
    );
  });

  it('rejects --fix combined with --all', () => {
    const output = captureOutput();
    expect(
      runCli({ arguments_: ['--fix', '--all'], stdout: output.stdout, stderr: output.stderr }),
    ).toBe(2);
    expect(output.stderrText).toContain('--fix cannot be combined with --all');
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

describe('nitpicker config file', () => {
  function runWithConfig(config, { extraArguments = ['--base', 'HEAD'], analyzers } = {}) {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/clean.ts': 'export const clean = true;\n',
    });
    if (config !== undefined) {
      writeFiles(repository.root, {
        'nitpicker.config.json': typeof config === 'string' ? config : JSON.stringify(config),
      });
    }
    const output = captureOutput();
    const outputRoot = makeOutputRoot();
    const exitCode = runCli({
      arguments_: ['--output', outputRoot, ...extraArguments],
      environment: {},
      currentProjectRoot: repository.root,
      analyzers: analyzers ?? [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });
    const summaryPath = path.join(outputRoot, 'summary.json');
    const summary = existsSync(summaryPath)
      ? JSON.parse(readFileSync(summaryPath, 'utf8'))
      : undefined;
    return { exitCode, output, summary, outputRoot };
  }

  it('works with no config and reports no overrides', () => {
    const { exitCode, summary } = runWithConfig(undefined);

    expect(exitCode).toBe(0);
    expect(summary.configOverrides).toEqual([]);
  });

  it('uses base from the config file', () => {
    const { exitCode, output } = runWithConfig({ base: 'HEAD' }, { extraArguments: [] });

    expect(exitCode).toBe(0);
    expect(output.stdoutText).toContain('Base: HEAD (config)');
  });

  it('lets an explicit --base win over the config base', () => {
    const { output } = runWithConfig({ base: 'does-not-exist' });

    expect(output.stdoutText).toContain('Base: HEAD (argument)');
  });

  it('skips disabled analyzers, reports the override, and changes the policy hash', () => {
    const analyzers = [fakeAnalyzer(), fakeAnalyzer('second-analyzer')];
    const plain = runWithConfig(undefined, { analyzers });
    const disabled = runWithConfig({ disable: ['second-analyzer'] }, { analyzers });

    expect(plain.summary.tools.map(({ name }) => name)).toEqual([
      'fake-quality-analyzer',
      'second-analyzer',
    ]);
    expect(disabled.summary.tools.map(({ name }) => name)).toEqual(['fake-quality-analyzer']);
    expect(disabled.summary.configOverrides).toEqual(['disable: ["second-analyzer"]']);
    expect(disabled.summary.policyHash).not.toBe(plain.summary.policyHash);
    expect(readFileSync(path.join(disabled.outputRoot, 'report.txt'), 'utf8')).toContain(
      'disable: ["second-analyzer"]',
    );
  });

  it('rejects disabling an unknown analyzer', () => {
    const { exitCode, output } = runWithConfig({ disable: ['nope'] });

    expect(exitCode).toBe(2);
    expect(output.stderrText).toContain('unknown analyzers: nope');
  });

  it('reports every parsed key and changes the policy hash for each', () => {
    const hashes = new Set([runWithConfig(undefined).summary.policyHash]);
    for (const [key, value] of [
      ['preset', 'typescript'],
      ['thresholds', { crapLimit: 12 }],
      ['exclude', ['generated/**']],
      ['layout', { source: ['lib'] }],
      ['analyzers', [{ name: 'custom', command: './check.sh' }]],
    ]) {
      const { summary, exitCode } = runWithConfig({ [key]: value });
      expect(exitCode).toBe(0);
      expect(summary.configOverrides).toEqual([`${key}: ${JSON.stringify(value)}`]);
      hashes.add(summary.policyHash);
    }
    expect(hashes.size).toBe(6);
  });

  it.each([
    [{ unknownKey: true }, /unknown key "unknownKey"/],
    [{ preset: 'strict' }, /"preset" must be one of: typescript/],
    [{ thresholds: { crapLimit: 'x' } }, /positive number/],
    [{ thresholds: { other: 1 } }, /unknown threshold "other"/],
    [{ base: '' }, /"base" must be a non-empty string/],
    [{ analyzers: [{ name: 'a' }] }, /needs a non-empty "name" and "command"/],
    ['{not json', /not valid JSON/],
  ])('fails for an invalid config %j', (config, message) => {
    const { exitCode, output } = runWithConfig(config);

    expect(exitCode).toBe(2);
    expect(output.stderrText).toMatch(message);
  });
});

describe('findings cache', () => {
  function setup() {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/old.ts': findingLine(finding({ identity: 'old-finding' })),
    });
    writeFiles(repository.root, {
      'src/main/new.ts': findingLine(finding({ identity: 'new-finding' })),
    });
    const cacheDirectory = makeTemporaryRoot('nitpicker-cli-cache-');
    const snapshots = [];
    const run = ({ extraArguments = [], configurationHash = 'fixture-policy' } = {}) => {
      const analyzer = fakeAnalyzer();
      analyzer.configurationHash = configurationHash;
      const createInvocation = analyzer.createInvocation;
      analyzer.createInvocation = (context) => {
        snapshots.push(context.snapshot);
        return createInvocation(context);
      };
      const output = captureOutput();
      const exitCode = runCli({
        arguments_: ['--base', repository.baseRef, '--output', makeOutputRoot(), ...extraArguments],
        environment: { NITPICKER_CACHE_DIR: cacheDirectory },
        currentProjectRoot: repository.root,
        analyzers: [analyzer],
        stdout: output.stdout,
        stderr: output.stderr,
      });
      return { exitCode, output };
    };
    return { run, snapshots };
  }

  it('skips base analysis on a second run against the same base', () => {
    const { run, snapshots } = setup();

    const first = run();
    const second = run();

    expect(first.exitCode).toBe(1);
    expect(second.exitCode).toBe(1);
    expect(second.output.stdoutText).toContain('new.ts');
    expect(snapshots).toEqual(['base', 'head', 'head']);
  });

  it('analyzes the base again with --no-cache', () => {
    const { run, snapshots } = setup();

    run();
    run({ extraArguments: ['--no-cache'] });

    expect(snapshots).toEqual(['base', 'head', 'base', 'head']);
  });

  it('analyzes the base again when the head policy hash changes', () => {
    const { run, snapshots } = setup();

    run();
    run({ configurationHash: 'changed-policy' });

    expect(snapshots).toEqual(['base', 'head', 'base', 'head']);
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
