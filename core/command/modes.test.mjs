import { readFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../cli.mts';
import {
  exactText,
  maskedDiagnostics,
} from '../diff/reporting/test-support/output-expectations.mjs';
import { finding, findingLine, policy } from '../diff/execution/test-support/analyzer-findings.mjs';
import { captureOutput } from '../diff/reporting/test-support/output-capture.mjs';
import { commit, fixtureGit } from '../diff/git/test-support/git-repository.mjs';
import { crashingAnalyzer, fakeAnalyzer, useCliFixtures } from './test-support/cli-harness.mjs';
import { writeFiles } from '../diff/git/test-support/fixture-files.mjs';
import { linkSentence } from '../../shared/messages/test-support/link-sentence.mjs';
const { createRepository, makeOutputRoot, makeTemporaryRoot, runCli } =
  useCliFixtures(nitpickerCli);
const CRASH = `crashing-analyzer crashed with exit 2: no diagnostic output. ${linkSentence('analyzerCrashed')}`;
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
        policyChangeAccepted: false,
        notices: [],
        tools: [],
        exclusions: [],
        renamedPaths: 0,
        elapsedMs: expect.any(Number),
        mode: 'full',
        generatedAt: expect.any(String),
        workingTree: expect.any(String),
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
    expect(maskedDiagnostics(output.stdoutText)).toEqual(
      [
        '',
        'Quality snapshot summary',
        '✖ 2 enforceable findings',
        '  fake-quality-analyzer/fixture-rule: Fixture finding',
        '    src/main/first.ts:1:4',
        '  fake-quality-analyzer/other-rule: Fixture finding',
        '    src/main/second.ts:1:4',
        'By analyzer:',
        '  fake-quality-analyzer: 2 enforceable, 0 descriptive',
        'Full diagnostics: <path>',
        '',
      ].join('\n'),
    );
    expect(output.stderrText).toBe('');
  });
  it('returns a tool error for a crashing --all analyzer', () => {
    const repository = createRepository({
      'quality-policy.json': JSON.stringify({ marker: 'QUALITY_FINDING', mode: 'crash' }),
      'src/main/clean.ts': 'export const clean = true;\n',
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
    expect(maskedDiagnostics(output.stdoutText)).toEqual(
      [
        '',
        'Quality snapshot summary',
        'No enforceable findings, but the run is incomplete:',
        '✖ 1 tool error',
        `  fake-quality-analyzer (head): fake-quality-analyzer crashed with exit 2: fake analyzer crash. ${linkSentence('analyzerCrashed')}`,
        'By analyzer:',
        '  1 analyzer ran clean',
        'Full diagnostics: <path>',
        '',
      ].join('\n'),
    );
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
      writeFiles(repository.root, { 'src/main/edited.ts': 'export const edited = true;\n' });
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
    const expectedModeOutput =
      mode === '--all'
        ? [
            '',
            'Quality snapshot summary',
            '✖ 1 enforceable finding',
            '  fake-quality-analyzer/fixture-rule: Fixture finding',
            '    src/main/new.ts:1:4',
            '✖ 1 tool error',
            `  crashing-analyzer (head): ${CRASH}`,
            'By analyzer:',
            '  fake-quality-analyzer: 1 enforceable, 0 descriptive',
            '  1 analyzer ran clean',
            'Full diagnostics: <path>',
            '',
          ].join('\n')
        : expect.stringMatching(exactText`Base: comparison-base (argument)

Quality gate summary
✖ 1 new enforceable violation
  fake-quality-analyzer/fixture-rule: Fixture finding
    src/main/new.ts:1:4
✖ 2 tool errors (1 distinct)
  crashing-analyzer (base and head): ${CRASH}
Full diagnostics: /tmp/nitpicker-cli-output-${/[A-Za-z0-9]{6}/}/reports/report.txt
`);
    it('exits 1 for findings plus a tool error and still lists the error', () => {
      const { exitCode, output } = run({ withFinding: true, withToolError: true });
      expect(exitCode).toBe(1);
      expect(mode === '--all' ? maskedDiagnostics(output.stdoutText) : output.stdoutText).toEqual(
        expectedModeOutput,
      );
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
    expect(maskedDiagnostics(output.stdoutText)).toEqual(
      [
        '',
        'Quality snapshot summary',
        '✖ 1 enforceable finding',
        '  fake-quality-analyzer/match-me: Fixture finding',
        '    src/main/existing.ts:1:4',
        'By analyzer:',
        '  fake-quality-analyzer: 1 enforceable, 0 descriptive',
        'Full diagnostics: <path>',
        '',
        'Findings matching --rule match-me:',
        '',
        '  Matching:',
        'fake-quality-analyzer/match-me src/main/existing.ts:1 Fixture finding',
        '',
      ].join('\n'),
    );
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
    expect(unknown.stderrText).toEqual(
      'nitpicker failed: Unknown --analyzer: unknown. Known analyzers: fake-quality-analyzer\n',
    );
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
    expect(maskedDiagnostics(output.stdoutText)).toEqual(
      [
        '',
        'Quality snapshot summary',
        '✖ 3 enforceable findings',
        '  prettier-format/prettier/prettier: These lines are not formatted with Prettier. Run `nitpicker --fix` to format the changed files; it skips a file that was already unformatted on the base, so format such lines by hand.',
        '    package-lock.json:1',
        '    package.json:1',
        '    src/main/example.ts:1',
        'By analyzer:',
        '  prettier-format: 3 enforceable, 0 descriptive',
        'Ran only: prettier-format. Run nitpicker without --analyzer before you finish.',
        'Full diagnostics: <path>',
        '',
      ].join('\n'),
    );
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
    fixtureGit(repository.root, ['add', 'src/main/staged.ts']);
    writeFiles(repository.root, {
      'src/main/staged.ts': 'export const staged = 2;\n',
      'src/main/untracked.ts': findingLine(finding({ identity: 'untracked-all' })),
    });
    const beforeStatus = fixtureGit(repository.root, ['status', '--porcelain=v1']);
    const beforeIndex = fixtureGit(repository.root, ['ls-files', '--stage']);
    const output = captureOutput();
    const exitCode = runCli({
      arguments_: ['--all', '--output', makeOutputRoot()],
      currentProjectRoot: repository.root,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });
    expect(exitCode).toBe(1);
    expect(maskedDiagnostics(output.stdoutText)).toEqual(
      [
        '',
        'Quality snapshot summary',
        '✖ 1 enforceable finding',
        '  fake-quality-analyzer/fixture-rule: Fixture finding',
        '    src/main/untracked.ts:1:4',
        'By analyzer:',
        '  fake-quality-analyzer: 1 enforceable, 0 descriptive',
        'Full diagnostics: <path>',
        '',
      ].join('\n'),
    );
    expect(fixtureGit(repository.root, ['status', '--porcelain=v1'])).toBe(beforeStatus);
    expect(fixtureGit(repository.root, ['ls-files', '--stage'])).toBe(beforeIndex);
  });
});
