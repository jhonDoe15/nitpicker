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
import { runCli as runCliWithSubprocesses } from './cli.mjs';
import { describeConfigOverrides } from './config.mjs';
import { policyHash } from './diff/report-model.mjs';
import { startTestHttpServer } from './diff/test-http-server.mjs';
import { runTasksInProcess } from './diff/fixtures/in-process-analyzers.mjs';
import { resolveRunLockPath } from './run-lock.mjs';

// Most tests here are about diff, report and CLI logic, so the analyzer task graph and the fixture
// analyzers run in-process. A test that passes `runTasks: undefined` keeps the real
// analyzer-scheduler subprocess path (exit codes, invalid JSON, timeouts). Progress lines are
// discarded unless a test passes `progress`.
const discardedProgress = { write() {} };
const runCli = (options) =>
  runCliWithSubprocesses({ runTasks: runTasksInProcess, progress: discardedProgress, ...options });

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
      runTasks: undefined,
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
        runTasks: undefined,
      }),
    ).toBe(2);
    expect(output.stdoutText).toContain('Status: tool-error');
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
      expect(output.stdoutText).toContain('crashing-analyzer');
      expect(output.stdoutText).toContain('new.ts');
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

  it('does not fix files that the config excludes, and fixes custom layout roots', () => {
    const repository = createRepository({
      'nitpicker.config.json': `${JSON.stringify(
        {
          exclude: ['lib/legacy/**'],
          layout: { sourceRoots: ['lib'], testRoots: ['spec'] },
        },
        null,
        2,
      )}\n`,
      'lib/changed.ts': 'export const changed = 1;\n',
      'lib/legacy/old.ts': 'export const old = 1;\n',
      'spec/placeholder.ts': 'export const placeholder = true;\n',
    });
    symlinkSync(
      path.join(import.meta.dirname, '../node_modules'),
      path.join(repository.root, 'node_modules'),
      'dir',
    );
    writeFiles(repository.root, {
      'lib/changed.ts': 'export let changed=3;\n',
      'lib/legacy/old.ts': 'export let old=3;\n',
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
    expect(exitCode, output.stdoutText + output.stderrText).toBe(0);
    expect(readFileSync(path.join(repository.root, 'lib/changed.ts'), 'utf8')).toBe(
      'export const changed = 3;\n',
    );
    expect(readFileSync(path.join(repository.root, 'lib/legacy/old.ts'), 'utf8')).toBe(
      'export let old=3;\n',
    );
    expect(output.stdoutText).toMatch(/Fixed files:\nlib\/changed.ts\nBase:/);
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

  it('merges two shard reports through the aggregate subcommand', () => {
    const root = realpathSync(makeTemporaryRoot('nitpicker-cli-aggregate-'));
    const analyzers = ['first', 'second'].map((name) => ({
      name,
      version: '1.0.0',
      configurationHash: `hash-${name}`,
      exclusions: [],
      dependencies: [],
      shardWeight: 1,
    }));
    const finding = {
      tool: 'second',
      rule: 'example',
      path: 'src/main/example.ts',
      identity: 'example',
      message: 'example finding',
      classification: 'enforceable',
    };
    for (const [index, { name }] of analyzers.entries()) {
      const findings = index === 1 ? [finding] : [];
      const shardRoot = path.join(root, 'shards', String(index));
      mkdirSync(shardRoot, { recursive: true });
      const files = {
        'summary.json': {
          requestedBaseRef: 'origin/main',
          resolvedBaseSha: 'base',
          mergeBaseSha: 'merge-base',
          headSha: 'head',
          policyHash: `shard-${String(index)}`,
          tools: [{ name, version: '1.0.0', configurationHash: `hash-${name}` }],
          exclusions: [],
          renamedPaths: 0,
          elapsedMs: 10,
          overallStatus: 'completed',
          newEnforceableFindings: findings.length,
        },
        'new-findings.json': findings,
        'resolved-findings.json': [],
        'changed-metrics.json': [],
        'tool-errors.json': [],
      };
      for (const [fileName, value] of Object.entries(files)) {
        writeFileSync(path.join(shardRoot, fileName), JSON.stringify(value));
      }
    }
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: [
        'aggregate',
        '--input-root',
        'shards',
        '--shard-count',
        '2',
        '--output',
        'combined',
      ],
      environment: { NO_COLOR: '1' },
      currentProjectRoot: root,
      analyzers,
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(1);
    expect(output.stdoutText).toContain('src/main/example.ts');
    expect(output.stderrText).toBe('');
    const summary = JSON.parse(readFileSync(path.join(root, 'combined', 'summary.json'), 'utf8'));
    expect(summary.tools.map(({ name }) => name)).toEqual(['first', 'second']);
    expect(summary.newEnforceableFindings).toBe(1);
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
  // Config errors are raised before any git work, so these need only the config file.
  function runConfigOnly(config) {
    const projectRoot = makeTemporaryRoot('nitpicker-cli-config-');
    writeFiles(projectRoot, {
      'nitpicker.config.json': typeof config === 'string' ? config : JSON.stringify(config),
    });
    const output = captureOutput();
    const exitCode = runCli({
      arguments_: ['--output', makeOutputRoot()],
      environment: {},
      currentProjectRoot: projectRoot,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });
    return { exitCode, output };
  }

  function runWithConfig(config, { extraArguments = ['--base', 'HEAD'], analyzers } = {}) {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/clean.ts': 'export const clean = true;\n',
      'custom-analyzer.mjs': customAnalyzerScript,
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
    const { exitCode, output } = runWithConfig({ base: 'comparison-base' }, { extraArguments: [] });
    const baseLine = output.stdoutText.split('\n').find((line) => line.startsWith('Base: '));
    expect(exitCode).toBe(0);
    expect(baseLine).toBe('Base: comparison-base (config)');
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
    const { exitCode, output } = runConfigOnly({ disable: ['nope'] });

    expect(exitCode).toBe(2);
    expect(output.stderrText).toContain('unknown analyzers: nope');
  });

  it('reports every parsed key and changes the policy hash for each', () => {
    // Keys in describeConfigOverrides order. One run covers the CLI wiring for most of them.
    // `exclude` gets its own run: with it set, the layout-only branch of applyLayout is skipped.
    const entries = [
      ['preset', 'typescript'],
      ['thresholds', { crapLimit: 12 }],
      ['layout', { sourceRoots: ['lib'] }],
      ['analyzers', [customAnalyzerEntry('clean')]],
      ['legacyInventory', 'config/legacy.json'],
    ];
    const plainHash = runWithConfig(undefined).summary.policyHash;
    const { summary, exitCode } = runWithConfig(Object.fromEntries(entries));
    expect(exitCode).toBe(0);
    expect(summary.configOverrides).toEqual(
      entries.map(([key, value]) => `${String(key)}: ${JSON.stringify(value)}`),
    );
    expect(summary.policyHash).not.toBe(plainHash);
    const excluded = runWithConfig({ exclude: ['generated/**'] });
    expect(excluded.exitCode).toBe(0);
    expect(excluded.summary.configOverrides).toEqual(['exclude: ["generated/**"]']);
    expect(excluded.summary.policyHash).not.toBe(plainHash);
    // Each key alone must change the hash, computed with the same functions the CLI uses.
    const analyzers = [fakeAnalyzer()];
    for (const [key, value] of [...entries, ['exclude', ['generated/**']]]) {
      expect(policyHash(analyzers, describeConfigOverrides({ [key]: value }))).not.toBe(
        policyHash(analyzers),
      );
    }
  });

  describe('custom analyzers', () => {
    it('classifies findings from a valid analyzer like built-in findings', () => {
      const repository = createRepository({
        'quality-policy.json': policy(),
        'custom-analyzer.mjs': customAnalyzerScript,
        'src/main/old.txt': 'legacy\n',
      });
      writeFiles(repository.root, {
        'nitpicker.config.json': JSON.stringify({ analyzers: [customAnalyzerEntry('files')] }),
        'src/main/new.txt': 'added\n',
      });
      const output = captureOutput();
      const outputRoot = makeOutputRoot();

      const exitCode = runCli({
        arguments_: ['--base', repository.baseRef, '--output', outputRoot],
        environment: {},
        currentProjectRoot: repository.root,
        analyzers: [fakeAnalyzer()],
        stdout: output.stdout,
        stderr: output.stderr,
      });

      const summary = JSON.parse(readFileSync(path.join(outputRoot, 'summary.json'), 'utf8'));
      const tool = summary.tools.find(({ name }) => name === 'custom');
      expect(exitCode).toBe(1);
      expect(tool).toMatchObject({ base: 1, head: 2, new: 1, unchanged: 1 });
      expect(output.stdoutText).toContain('src/main/new.txt');
    });

    it.each([
      ['json', /custom did not produce valid JSON/],
      ['shape', /custom output must contain a findings array/],
      ['crash', /custom crashed with exit 3: custom analyzer failed/],
    ])('reports a %s failure as a tool error', (mode, message) => {
      const { exitCode, output, summary } = runWithConfig({
        analyzers: [customAnalyzerEntry(mode)],
      });

      expect(exitCode).toBe(2);
      expect(summary.overallStatus).toBe('tool-error');
      expect(output.stdoutText).toMatch(message);
    });

    it('rejects a name that clashes with a built-in analyzer', () => {
      const { exitCode, output } = runConfigOnly({
        analyzers: [{ ...customAnalyzerEntry('clean'), name: 'fake-quality-analyzer' }],
      });

      expect(exitCode).toBe(2);
      expect(output.stderrText).toContain('clashes with another analyzer name');
    });
  });

  it('reports a strict exception and changes the policy hash', () => {
    const exception = {
      rule: 'nitpicker/preserve-error-cause',
      paths: ['src/legacy/**'],
      reason: 'Legacy module until migration',
    };
    const plain = runWithConfig(undefined).summary.policyHash;
    const { summary, exitCode } = runWithConfig({ exceptions: [exception] });
    expect(exitCode).toBe(0);
    expect(summary.configOverrides).toEqual([`exception: ${JSON.stringify(exception)}`]);
    expect(summary.policyHash).not.toBe(plain);
  });

  it.each([
    [{ unknownKey: true }, /unknown key "unknownKey"/],
    [{ preset: 'strict' }, /"preset" must be one of: typescript/],
    [{ thresholds: { crapLimit: 'x' } }, /positive number/],
    [{ thresholds: { other: 1 } }, /unknown threshold "other"/],
    [
      { legacyInventory: '/abs/legacy.json' },
      /"legacyInventory" must be a path inside the project/,
    ],
    [{ legacyInventory: '../legacy.json' }, /"legacyInventory" must be a path inside the project/],
    [{ legacyInventory: '' }, /"legacyInventory" must be a non-empty string/],
    [{ base: '' }, /"base" must be a non-empty string/],
    [{ analyzers: [{ name: 'a' }] }, /needs a non-empty "name" and "command"/],
    ['{not json', /not valid JSON/],
  ])('fails for an invalid config %j', (config, message) => {
    const { exitCode, output } = runConfigOnly(config);

    expect(exitCode).toBe(2);
    expect(output.stderrText).toMatch(message);
  });
});

const customAnalyzerScript = `import { existsSync, readdirSync } from 'node:fs';
const mode = process.argv[2];
if (mode === 'crash') {
  process.stderr.write('custom analyzer failed\\n');
  process.exit(3);
}
if (mode === 'json') {
  process.stdout.write('{not-json');
} else if (mode === 'shape') {
  process.stdout.write('{"items":[]}');
} else {
  const files = mode === 'files' && existsSync('src/main') ? readdirSync('src/main').sort() : [];
  const findings = files
    .filter((file) => file.endsWith('.txt'))
    .map((file) => ({
      tool: 'custom',
      rule: 'text-file',
      path: 'src/main/' + file,
      identity: 'text-file:' + file,
      message: 'Text file ' + file,
      classification: 'enforceable',
    }));
  process.stdout.write(JSON.stringify({ findings }));
}
`;

function customAnalyzerEntry(mode) {
  return { name: 'custom', command: process.execPath, args: ['custom-analyzer.mjs', mode] };
}

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
      const createInvocation = analyzer.createInvocation.bind(analyzer);
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

describe('remote findings cache', () => {
  async function setup() {
    const remote = await startTestHttpServer();
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/old.ts': findingLine(finding({ identity: 'old-finding' })),
    });
    writeFiles(repository.root, {
      'src/main/new.ts': findingLine(finding({ identity: 'new-finding' })),
    });
    const snapshots = [];
    const execute = (arguments_, url = remote.url, { subprocess = false } = {}) => {
      const analyzer = fakeAnalyzer();
      const createInvocation = analyzer.createInvocation.bind(analyzer);
      analyzer.createInvocation = (context) => {
        snapshots.push(context.snapshot);
        return createInvocation(context);
      };
      const output = captureOutput();
      const exitCode = runCli({
        arguments_,
        environment: {
          NITPICKER_CACHE_DIR: makeTemporaryRoot('nitpicker-cli-cache-'),
          NITPICKER_CACHE_URL: url,
        },
        currentProjectRoot: repository.root,
        analyzers: [analyzer],
        stdout: output.stdout,
        stderr: output.stderr,
        runTasks: subprocess ? undefined : runTasksInProcess,
      });
      return { exitCode, output };
    };
    const compare = (url) =>
      execute(['--base', repository.baseRef, '--output', makeOutputRoot()], url);
    return { remote, snapshots, execute, compare };
  }

  it('publishes a base snapshot that a fresh checkout then reuses', async () => {
    const { remote, snapshots, execute, compare } = await setup();
    try {
      // The real scheduler subprocess publishes; the comparison then runs in-process.
      const published = execute(['cache', 'publish'], remote.url, { subprocess: true });
      expect(published.exitCode).toBe(0);
      expect(published.output.stdoutText).toContain('Published 1 of 1 base snapshots');
      expect(await remote.keys()).toHaveLength(1);

      const result = compare();

      expect(result.exitCode).toBe(1);
      expect(result.output.stdoutText).toContain('new.ts');
      expect(snapshots).toEqual(['base', 'head']);
    } finally {
      await remote.close();
    }
  });

  it('still gates when the remote cache is unreachable', async () => {
    const { remote, snapshots, compare } = await setup();
    await remote.failWith(500);
    try {
      const result = compare();

      expect(result.exitCode).toBe(1);
      expect(result.output.stdoutText).toContain('new.ts');
      expect(snapshots).toEqual(['base', 'head']);
    } finally {
      await remote.close();
    }
  });

  it('fails publishing without a remote URL, and reports an unreachable one', async () => {
    const { remote, execute } = await setup();
    try {
      expect(execute(['cache', 'publish'], '').exitCode).toBe(2);
      await remote.failWith(500);
      const result = execute(['cache', 'publish']);
      expect(result.exitCode).toBe(2);
      expect(result.output.stdoutText).toContain('Not published: fake-quality-analyzer');
    } finally {
      await remote.close();
    }
  });
});

describe('nitpicker progress and run lock', () => {
  function setup() {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/clean.ts': 'export const clean = true;\n',
    });
    const cacheDirectory = makeTemporaryRoot('nitpicker-cli-cache-');
    const run = (extra = {}) => {
      const output = captureOutput();
      const exitCode = runCli({
        arguments_: ['--base', repository.baseRef, '--output', makeOutputRoot()],
        environment: { NITPICKER_CACHE_DIR: cacheDirectory },
        currentProjectRoot: repository.root,
        analyzers: [fakeAnalyzer()],
        stdout: output.stdout,
        stderr: output.stderr,
        progress: output.stderr,
        ...extra,
      });
      return { exitCode, output };
    };
    return { repository, run, lockPath: resolveRunLockPath(repository.root) };
  }

  it('prints a start line per phase to stderr and leaves out quick successful analyzers', () => {
    const { run } = setup();

    const { exitCode, output } = run();

    expect(exitCode).toBe(0);
    expect(output.stderrText.split('\n').filter(Boolean)).toEqual([
      'nitpicker: base: running 1 analyzer',
      'nitpicker: head: running 1 analyzer',
    ]);
    expect(output.stdoutText).not.toContain('nitpicker: head');
  });

  it('says the base was cached instead of running it again', () => {
    const { run } = setup();
    run();

    const { output } = run();

    expect(output.stderrText.split('\n').filter(Boolean)).toEqual([
      'nitpicker: base 1 analyzer cached',
      'nitpicker: head: running 1 analyzer',
    ]);
  });

  it('labels the single snapshot of --all as head', () => {
    const { run } = setup();

    const { output } = run({ arguments_: ['--all', '--output', makeOutputRoot()] });

    expect(output.stderrText.split('\n').filter(Boolean)).toEqual([
      'nitpicker: head: running 1 analyzer',
    ]);
  });

  it('refuses to start while a live process holds the run lock', () => {
    const { run, lockPath } = setup();
    writeFileSync(lockPath, `${String(process.ppid)}\n`);

    const { exitCode, output } = run();

    expect(exitCode).toBe(2);
    expect(output.stderrText).toBe(
      `nitpicker: another run is in progress in this project (pid ${String(process.ppid)}); wait for it to finish.\n`,
    );
    expect(output.stdoutText).toBe('');
    expect(readFileSync(lockPath, 'utf8')).toBe(`${String(process.ppid)}\n`);
  });

  it('takes over a lock whose process is gone and removes it after the run', () => {
    const { run, lockPath } = setup();
    writeFileSync(lockPath, '2147483646\n');

    const { exitCode } = run();

    expect(exitCode).toBe(0);
    expect(existsSync(lockPath)).toBe(false);
  });

  it('removes the lock after a run that fails', () => {
    const { run, lockPath } = setup();

    const { exitCode } = run({ arguments_: ['--analyzer', 'unknown'] });

    expect(exitCode).toBe(2);
    expect(existsSync(lockPath)).toBe(false);
  });
});

function createRepository(initialFiles) {
  const root = realpathSync(makeTemporaryRoot('nitpicker-cli-repo-'));
  git(root, ['init', '-q', '--initial-branch=main']);
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
