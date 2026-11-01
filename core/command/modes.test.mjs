import { symlinkSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../cli.mjs';
import { exactText } from '../diff/reporting/test-support/output-expectations.mjs';
import { finding, findingLine, policy } from '../diff/execution/test-support/analyzer-findings.mjs';
import { captureOutput } from '../diff/reporting/test-support/output-capture.mjs';
import { commit, fixtureGit } from '../diff/git/test-support/git-repository.mjs';
import { crashingAnalyzer, fakeAnalyzer, useCliFixtures } from './test-support/cli-harness.mjs';
import { writeFiles } from '../diff/git/test-support/fixture-files.mjs';
import { linkSentence } from '../../shared/messages/test-support/link-sentence.mjs';
import { docsUrl } from '../../shared/messages/docs-url.mjs';

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

\u001b[1m\u001b[31mQuality gate summary\u001b[0m
\u001b[1m\u001b[31m✖ 1 new enforceable violation\u001b[0m
  \u001b[33mfake-quality-analyzer/fixture-rule\u001b[0m: Fixture finding
    src/main/untracked.ts:1:4
\u001b[2mFull diagnostics: /tmp/nitpicker-cli-output-${/[A-Za-z0-9]{6}/}/reports/report.txt\u001b[0m
`),
    );
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
    expect(output.stdoutText).toEqual(
      expect.stringMatching(exactText`Base: ${repository.baseRef} (argument)

\u001b[1m\u001b[32mQuality gate summary\u001b[0m
\u001b[32m✓ No new enforceable violations\u001b[0m
\u001b[2mFull diagnostics: /tmp/nitpicker-cli-output-${/[A-Za-z0-9]{6}/}/reports/report.txt\u001b[0m
`),
    );
    expect(output.stderrText).toBe('');
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

\u001b[1m\u001b[32mQuality gate summary\u001b[0m
\u001b[32m✓ No new enforceable violations\u001b[0m
\u001b[2mFull diagnostics: /tmp/nitpicker-cli-output-${/[A-Za-z0-9]{6}/}/reports/report.txt\u001b[0m
`),
    );
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
    expect(output.stdoutText).toEqual(
      expect.stringMatching(exactText`Base: ${repository.baseRef} (argument)

\u001b[1m\u001b[32mQuality gate summary\u001b[0m
\u001b[32m✓ No new enforceable violations\u001b[0m
\u001b[2mFull diagnostics: /tmp/nitpicker-cli-output-${/[A-Za-z0-9]{6}/}/reports/report.txt\u001b[0m
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
    expect(output.stdoutText).toEqual(
      [
        'Nitpicker quality snapshot',
        'Status: violations',
        'Enforceable findings: 2',
        'Descriptive findings: 0',
        'Tool errors: 0',
        '',
        'Per-tool counts:',
        'fake-quality-analyzer: total=2 enforceable=2 descriptive=0',
        '',
        'Enforceable findings:',
        'fake-quality-analyzer/fixture-rule src/main/first.ts:1 Fixture finding',
        'fake-quality-analyzer/other-rule src/main/second.ts:1 Fixture finding',
        '',
      ].join('\n'),
    );
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
    expect(output.stdoutText).toEqual(
      [
        'Nitpicker quality snapshot',
        'Status: tool-error',
        'Enforceable findings: 0',
        'Descriptive findings: 0',
        'Tool errors: 1',
        '',
        'Per-tool counts:',
        'fake-quality-analyzer: total=0 enforceable=0 descriptive=0',
        '',
        'Tool errors:',
        `fake-quality-analyzer (head): fake-quality-analyzer crashed with exit 2: fake analyzer crash. ${linkSentence('analyzerCrashed')}`,
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
            'Nitpicker quality snapshot',
            'Status: tool-error',
            'Enforceable findings: 1',
            'Descriptive findings: 0',
            'Tool errors: 1',
            '',
            'Per-tool counts:',
            'fake-quality-analyzer: total=1 enforceable=1 descriptive=0',
            'crashing-analyzer: total=0 enforceable=0 descriptive=0',
            '',
            'Enforceable findings:',
            'fake-quality-analyzer/fixture-rule src/main/new.ts:1 Fixture finding',
            '',
            'Tool errors:',
            `crashing-analyzer (head): ${CRASH}`,
            '',
          ].join('\n')
        : expect.stringMatching(exactText`Base: comparison-base (argument)

\u001b[1m\u001b[31mQuality gate summary\u001b[0m
\u001b[1m\u001b[31m✖ 1 new enforceable violation\u001b[0m
  \u001b[33mfake-quality-analyzer/fixture-rule\u001b[0m: Fixture finding
    src/main/new.ts:1:4
\u001b[1m\u001b[31m✖ 2 tool errors\u001b[0m
  \u001b[33mcrashing-analyzer (base)\u001b[0m: ${CRASH}
  \u001b[33mcrashing-analyzer (head)\u001b[0m: ${CRASH}
\u001b[2mFull diagnostics: /tmp/nitpicker-cli-output-${/[A-Za-z0-9]{6}/}/reports/report.txt\u001b[0m
`);
    it('exits 1 for findings plus a tool error and still lists the error', () => {
      const { exitCode, output } = run({ withFinding: true, withToolError: true });
      expect(exitCode).toBe(1);
      expect(output.stdoutText).toEqual(expectedModeOutput);
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
    expect(output.stdoutText).toEqual(
      [
        'Nitpicker quality snapshot',
        'Status: violations',
        'Enforceable findings: 1',
        'Descriptive findings: 0',
        'Tool errors: 0',
        '',
        'Per-tool counts:',
        'fake-quality-analyzer: total=1 enforceable=1 descriptive=0',
        '',
        'Enforceable findings:',
        'fake-quality-analyzer/match-me src/main/existing.ts:1 Fixture finding',
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
      `nitpicker failed: Unknown --analyzer: unknown. Known analyzers: fake-quality-analyzer\n`,
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
    expect(output.stdoutText).toEqual(
      [
        'Nitpicker quality snapshot',
        'Status: violations',
        'Enforceable findings: 3',
        'Descriptive findings: 0',
        'Tool errors: 0',
        '',
        'Per-tool counts:',
        'prettier-format: total=3 enforceable=3 descriptive=0',
        '',
        'Enforceable findings:',
        'prettier-format/prettier/prettier package-lock.json:1 Format these lines with Prettier',
        'prettier-format/prettier/prettier package.json:1 Format these lines with Prettier',
        'prettier-format/prettier/prettier src/main/example.ts:1 Format these lines with Prettier',
        '',
        `Rule reference: ${docsUrl('docs/rules/README.md')} (nitpicker explain <tool/rule> prints one rule)`,
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
    expect(output.stdoutText).toEqual(
      [
        'Nitpicker quality snapshot',
        'Status: violations',
        'Enforceable findings: 1',
        'Descriptive findings: 0',
        'Tool errors: 0',
        '',
        'Per-tool counts:',
        'fake-quality-analyzer: total=1 enforceable=1 descriptive=0',
        '',
        'Enforceable findings:',
        'fake-quality-analyzer/fixture-rule src/main/untracked.ts:1 Fixture finding',
        '',
      ].join('\n'),
    );
    expect(fixtureGit(repository.root, ['status', '--porcelain=v1'])).toBe(beforeStatus);
    expect(fixtureGit(repository.root, ['ls-files', '--stage'])).toBe(beforeIndex);
  });
});
