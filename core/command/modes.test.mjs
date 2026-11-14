import { readFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../cli.mts';
import { exactText } from '../diff/reporting/test-support/output-expectations.mjs';
import { finding, findingLine, policy } from '../diff/execution/test-support/analyzer-findings.mjs';
import { captureOutput } from '../diff/reporting/test-support/output-capture.mjs';
import { commit, fixtureGit } from '../diff/git/test-support/git-repository.mjs';
import { crashingAnalyzer, fakeAnalyzer, useCliFixtures } from './test-support/cli-harness.mjs';
import { writeFiles } from '../diff/git/test-support/fixture-files.mjs';
const { createRepository, makeOutputRoot, makeTemporaryRoot, runCli } =
  useCliFixtures(nitpickerCli);
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
    expect(output.stdoutText).toEqual(
      expect.stringMatching(exactText`Base: ${repository.baseRef} (argument)

Quality gate summary
✖ 1 new enforceable violation
  fake-quality-analyzer/fixture-rule: Fixture finding
    src/main/untracked.ts:1:4
Full diagnostics: /tmp/nitpicker-cli-output-${/[A-Za-z0-9]{6}/}/reports/report.txt
`),
    );
    expect(output.stderrText).toBe('');
  });
  it('exits zero for a change with no new findings', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/clean.ts': 'export const clean = true;\n',
    });
    writeFiles(repository.root, { 'src/main/edited.ts': 'export const edited = true;\n' });
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
    expect(output.stdoutText).toEqual(
      expect.stringMatching(exactText`Base: ${repository.baseRef} (argument)

Quality gate summary
✓ No new enforceable violations
Full diagnostics: /tmp/nitpicker-cli-output-${/[A-Za-z0-9]{6}/}/reports/report.txt
`),
    );
    expect(output.stderrText).toBe('');
  });
  describe('with no change since the merge base', () => {
    const runUnchanged = (repository) => {
      const output = captureOutput();
      const outputRoot = makeOutputRoot();
      writeFiles(outputRoot, { 'new-findings.json': '[{"stale":true}]\n' });
      const exitCode = runCli({
        arguments_: ['--base', repository.baseRef, '--output', outputRoot],
        environment: {},
        currentProjectRoot: repository.root,
        analyzers: [crashingAnalyzer()],
        stdout: output.stdout,
        stderr: output.stderr,
      });
      const read = (name) => JSON.parse(readFileSync(path.join(outputRoot, name), 'utf8'));
      return { exitCode, output, summary: read('summary.json'), read };
    };
    it('runs no analyzer, prints one line, exits 0 and writes an empty summary', () => {
      const repository = createRepository({ 'src/main/clean.ts': 'export const clean = true;\n' });

      const { exitCode, output, summary, read } = runUnchanged(repository);

      expect(exitCode).toBe(0);
      expect(output.stdoutText).toBe(
        `No changes since comparison-base (${repository.baseSha.slice(0, 12)}); nothing to check.\n`,
      );
      expect(output.stderrText).toBe('');
      expect(summary).toEqual({
        requestedBaseRef: 'comparison-base',
        resolvedBaseSha: repository.baseSha,
        mergeBaseSha: repository.baseSha,
        headSha: repository.baseSha,
        policyHash: expect.any(String),
        configOverrides: [],
        policyChanges: [],
        policyLoosenings: [],
        projectPath: '.',
        policyChangeAccepted: false,
        notices: [],
        tools: [],
        exclusions: [],
        renamedPaths: 0,
        elapsedMs: expect.any(Number),
        mode: 'full',
        overallStatus: 'completed',
        newEnforceableFindings: 0,
        noChanges: true,
      });
      expect([read('new-findings.json'), read('tool-errors.json')]).toEqual([[], []]);
    });
    it('skips the run when the working tree undoes the committed change', () => {
      const repository = createRepository({ 'src/main/clean.ts': 'export const clean = true;\n' });
      writeFiles(repository.root, { 'src/main/clean.ts': 'export const clean = false;\n' });
      commit(repository.root, 'edit');
      writeFiles(repository.root, { 'src/main/clean.ts': 'export const clean = true;\n' });

      const { exitCode, summary } = runUnchanged(repository);

      expect(exitCode).toBe(0);
      expect(summary.noChanges).toBe(true);
      expect(summary.headSha).not.toBe(repository.baseSha);
    });
    it('runs the analyzers for a change made only in the working tree', () => {
      const repository = createRepository({ 'src/main/clean.ts': 'export const clean = true;\n' });
      writeFiles(repository.root, { 'src/main/untracked.ts': 'export const added = true;\n' });

      const { exitCode, summary } = runUnchanged(repository);

      expect(exitCode).toBe(2);
      expect(summary.noChanges).toBeUndefined();
      expect(summary.tools.map(({ name }) => name)).toEqual(['crashing-analyzer']);
    });
  });
  it('resolves the base from the remote HEAD when no base is given', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/clean.ts': 'export const clean = true;\n',
    });
    fixtureGit(repository.root, ['update-ref', 'refs/remotes/origin/main', repository.baseSha]);
    fixtureGit(repository.root, [
      'symbolic-ref',
      'refs/remotes/origin/HEAD',
      'refs/remotes/origin/main',
    ]);
    fixtureGit(repository.root, ['remote', 'add', 'origin', repository.root]);
    writeFiles(repository.root, { 'src/main/edited.ts': 'export const edited = true;\n' });
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
    expect(output.stdoutText).toEqual(
      expect.stringMatching(exactText`Base: origin/main (remote-head)

Quality gate summary
✓ No new enforceable violations
Full diagnostics: /tmp/nitpicker-cli-output-${/[A-Za-z0-9]{6}/}/reports/report.txt
`),
    );
    expect(output.stderrText).toBe('');
  });
  it('compares with the local main when the repository has no remote', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/clean.ts': 'export const clean = true;\n',
    });
    const run = (arguments_) => {
      const output = captureOutput();
      const exitCode = runCli({
        arguments_,
        environment: {},
        currentProjectRoot: repository.root,
        analyzers: [fakeAnalyzer()],
        stdout: output.stdout,
        stderr: output.stderr,
      });
      return { exitCode, stdout: output.stdoutText, stderr: output.stderrText };
    };

    expect(run(['base'])).toEqual({
      exitCode: 2,
      stdout: '',
      stderr:
        'nitpicker failed: No base found: no remote, and you are on main. Pass --base <ref>, set "base" in nitpicker.config.json, or run nitpicker --all to check the whole project.\n',
    });
    fixtureGit(repository.root, ['checkout', '-q', '-b', 'feature']);
    writeFiles(repository.root, { 'src/main/edited.ts': 'export const edited = true;\n' });
    expect(run(['base'])).toEqual({ exitCode: 0, stdout: 'main\n', stderr: '' });
    expect(run(['--output', makeOutputRoot()])).toEqual({
      exitCode: 0,
      stdout: expect.stringMatching(/^Base: main \(local-branch\)\n/u),
      stderr: '',
    });
  });
  it.each([[['--all']], [[]], [['base']]])(
    'asks for a first commit before %j in a repository without one',
    (arguments_) => {
      const repository = createRepository({ 'quality-policy.json': policy() });
      fixtureGit(repository.root, ['checkout', '-q', '--orphan', 'empty']);
      const output = captureOutput();

      const exitCode = runCli({
        arguments_: arguments_.includes('base')
          ? arguments_
          : [...arguments_, '--output', makeOutputRoot()],
        environment: {},
        currentProjectRoot: repository.root,
        analyzers: [fakeAnalyzer()],
        snapshotAnalyzers: [fakeAnalyzer()],
        stdout: output.stdout,
        stderr: output.stderr,
      });

      expect(exitCode).toBe(2);
      expect(output.stderrText).toBe(
        'nitpicker failed: This repository has no commits yet. Commit your files, then run nitpicker --all, or compare later changes against that commit.\n',
      );
    },
  );
  it('works when the project root is passed through a symlink', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/clean.ts': 'export const clean = true;\n',
    });
    const symlinkRoot = path.join(makeTemporaryRoot('nitpicker-symlink-'), 'project');
    symlinkSync(repository.root, symlinkRoot, 'dir');
    writeFiles(repository.root, { 'src/main/edited.ts': 'export const edited = true;\n' });
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: ['--base', repository.baseRef, '--output', makeOutputRoot()],
      environment: {},
      currentProjectRoot: symlinkRoot,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect([exitCode, output.stderrText]).toEqual([0, '']);
    expect(output.stdoutText).toEqual(
      expect.stringMatching(exactText`Base: ${repository.baseRef} (argument)

Quality gate summary
✓ No new enforceable violations
Full diagnostics: /tmp/nitpicker-cli-output-${/[A-Za-z0-9]{6}/}/reports/report.txt
`),
    );
  });
});
