import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../../cli.mjs';
import { captureOutput } from '../test-support/output-capture.mjs';
import { finding, findingLine, policy } from '../../execution/test-support/analyzer-findings.mjs';
import { readJson } from '../../git/test-support/fixture-files.mjs';
import {
  commitFiles,
  fakeAnalyzer,
  IN_PROCESS_TASKS,
  useQualityDiffRepositories,
} from '../../tests/policy/test-support/quality-diff-harness.mjs';

const { createRepository } = useQualityDiffRepositories();

const MESSAGE = 'Ran only: quiet-analyzer. Run nitpicker without --analyzer before you finish.';

function quietAnalyzer() {
  const analyzer = fakeAnalyzer();
  return {
    ...analyzer,
    name: 'quiet-analyzer',
    createInvocation(context) {
      const invocation = analyzer.createInvocation(context);
      const policyIndex = invocation.args.indexOf('--policy-root') + 1;
      return {
        ...invocation,
        args: invocation.args.with(policyIndex, path.join(context.policyRoot, 'quiet')),
      };
    },
  };
}

function repositoryWithNewFinding() {
  const repository = createRepository({
    'quality-policy.json': policy(),
    'quiet/quality-policy.json': policy({ marker: 'NEVER_PRESENT' }),
    'src/main/stable.ts': 'export const stable = true;\n',
  });
  commitFiles(
    repository.root,
    { 'src/main/new.ts': findingLine(finding({ identity: 'introduced' })) },
    'introduce finding',
  );
  return repository;
}

function run(repository, arguments_, outputRoot = 'reports/quality/diff', environment = {}) {
  const output = captureOutput();
  const exitCode = runCli({
    ...IN_PROCESS_TASKS,
    arguments_: [...arguments_, '--output', outputRoot],
    environment: { NO_COLOR: '1', ...environment },
    currentProjectRoot: repository.root,
    analyzers: [fakeAnalyzer(), quietAnalyzer()],
    stdout: output.stdout,
    stderr: output.stderr,
  });
  return { exitCode, ...output };
}

function readReports(outputRoot) {
  return Object.fromEntries(
    readdirSync(outputRoot).map((name) => [
      name,
      readFileSync(path.join(outputRoot, name), 'utf8'),
    ]),
  );
}

describe('runs narrowed with --analyzer', () => {
  it('says that only the named analyzers ran when another analyzer has new findings', () => {
    const repository = repositoryWithNewFinding();

    const narrowed = run(repository, [
      '--base',
      repository.baseRef,
      '--analyzer',
      'quiet-analyzer',
    ]);

    expect(narrowed.exitCode).toBe(0);
    expect(narrowed.stdoutText).toBe(
      [
        `Base: ${repository.baseRef} (argument)`,
        '',
        'Quality gate summary',
        '✓ No new enforceable violations',
        MESSAGE,
        `Full diagnostics: ${path.join(repository.outputRoot, 'report.txt')}`,
        '',
      ].join('\n'),
    );
    expect(
      readFileSync(path.join(repository.outputRoot, 'report.txt'), 'utf8').split('\n').slice(4, 12),
    ).toEqual([
      'Status: completed',
      'New enforceable findings: 0',
      'New findings: 0',
      'Resolved findings: 0',
      'Unchanged findings: 0',
      'Changed metrics: 0',
      'Tool errors: 0',
      MESSAGE,
    ]);
    expect(readJson(repository.outputRoot, 'summary.json').partialRun).toEqual({
      ran: ['quiet-analyzer'],
      skipped: ['fake-quality-analyzer'],
      message: MESSAGE,
    });

    const full = run(repository, ['--base', repository.baseRef]);

    expect(full.exitCode).toBe(1);
    expect(full.stdoutText).not.toContain('Ran only');
    expect(readJson(repository.outputRoot, 'summary.json')).not.toHaveProperty('partialRun');
  });

  it('marks a narrowed --all run the same way', () => {
    const repository = repositoryWithNewFinding();
    const outputRoot = 'reports/quality/snapshot';

    const narrowed = run(repository, ['--all', '--analyzer', 'quiet-analyzer'], outputRoot);

    expect(narrowed.exitCode).toBe(0);
    expect(narrowed.stdoutText).toBe(
      [
        'Nitpicker quality snapshot',
        'Status: clean',
        'Enforceable findings: 0',
        'Descriptive findings: 0',
        'Tool errors: 0',
        MESSAGE,
        '',
        'Per-tool counts:',
        'quiet-analyzer: total=0 enforceable=0 descriptive=0',
        '',
      ].join('\n'),
    );
    expect(readJson(repository.root, path.join(outputRoot, 'summary.json')).partialRun).toEqual({
      ran: ['quiet-analyzer'],
      skipped: ['fake-quality-analyzer'],
      message: MESSAGE,
    });
  });

  it.each([
    [
      'comparison',
      (repository) => ['--base', repository.baseRef],
      'reports/quality/diff',
      ['## nitpicker', '**✓ No new enforceable findings**'],
    ],
    [
      '--all',
      () => ['--all'],
      'reports/quality/snapshot',
      ['## nitpicker full run', '**✓ No enforceable findings**'],
    ],
  ])(
    'puts the line under the GitHub step summary headline of a %s run',
    (_, mode, outputRoot, [heading, headline]) => {
      const repository = repositoryWithNewFinding();
      const summaryPath = path.join(repository.root, outputRoot, '..', 'step-summary.md');

      run(repository, [...mode(repository), '--analyzer', 'quiet-analyzer'], outputRoot, {
        GITHUB_STEP_SUMMARY: summaryPath,
      });

      expect(readFileSync(summaryPath, 'utf8').split('\n').slice(0, 6)).toEqual([
        heading,
        '',
        headline,
        '',
        `> ${MESSAGE}`,
        '',
      ]);
    },
  );

  it.each([
    ['comparison', (repository) => ['--base', repository.baseRef], 'reports/quality/diff'],
    ['--all', () => ['--all'], 'reports/quality/snapshot'],
  ])('keeps the previous %s reports when an --analyzer name is unknown', (_, mode, outputRoot) => {
    const repository = repositoryWithNewFinding();
    expect(run(repository, mode(repository), outputRoot).exitCode).toBe(1);
    const previous = readReports(path.join(repository.root, outputRoot));

    const typo = run(repository, [...mode(repository), '--analyzer', 'mutant'], outputRoot);

    expect(typo.exitCode).toBe(2);
    expect(typo.stderrText).toBe(
      'nitpicker failed: Unknown --analyzer: mutant. Known analyzers: fake-quality-analyzer, quiet-analyzer\n',
    );
    expect(readReports(path.join(repository.root, outputRoot))).toEqual(previous);
  });
});
