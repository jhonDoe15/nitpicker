import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mjs';
import {
  finding,
  findingLine,
  policy,
} from '../../diff/execution/test-support/analyzer-findings.mjs';
import { captureOutput } from '../../diff/reporting/test-support/output-capture.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';
import { fakeAnalyzer, useCliFixtures } from '../../command/test-support/cli-harness.mjs';

const { createRepository, makeOutputRoot, runCli } = useCliFixtures(nitpickerCli);

const ANALYZER_NAMES = ['structure', 'coverage', 'crap'];

function namedAnalyzer(name) {
  return { ...fakeAnalyzer(name), reportedTools: ['fake-quality-analyzer'] };
}

const QUICK_LINE =
  'Quick run: skipped coverage, crap. Run nitpicker without --quick before you finish.';

function repositoryWithFinding() {
  const repository = createRepository({
    'quality-policy.json': policy(),
    'src/main/clean.ts': 'export const clean = true;\n',
  });
  writeFiles(repository.root, {
    'src/main/added.ts': findingLine(finding({ identity: 'added-finding' })),
  });
  return repository;
}

function run(repository, flags, outputRoot = makeOutputRoot()) {
  const output = captureOutput();
  const exitCode = runCli({
    arguments_: ['--base', repository.baseRef, '--output', outputRoot, ...flags],
    environment: { NO_COLOR: '1' },
    currentProjectRoot: repository.root,
    analyzers: ANALYZER_NAMES.map(namedAnalyzer),
    stdout: output.stdout,
    stderr: output.stderr,
  });
  return { exitCode, output, outputRoot };
}

function consoleSummary(outputRoot, verdict) {
  return [
    'Base: comparison-base (argument)',
    '',
    'Quality gate summary',
    ...verdict,
    QUICK_LINE,
    `Full diagnostics: ${path.join(outputRoot, 'report.txt')}`,
    '',
  ].join('\n');
}

const ADDED_FINDING = [
  '✖ 1 new enforceable violation',
  '  fake-quality-analyzer/fixture-rule src/main/added.ts:1',
  '    Fixture finding',
];

function readSummary(outputRoot) {
  return JSON.parse(readFileSync(path.join(outputRoot, 'summary.json'), 'utf8'));
}

describe('nitpicker --quick', () => {
  it('runs only the fast analyzers and lists what it skipped in the console and summary.json', () => {
    const { exitCode, output, outputRoot } = run(repositoryWithFinding(), ['--quick']);

    expect(exitCode).toBe(1);
    expect(output.stdoutText).toBe(consoleSummary(outputRoot, ADDED_FINDING));
    const summary = readSummary(outputRoot);
    expect(summary.tools.map(({ name }) => name)).toEqual(['structure']);
    expect(summary.mode).toBe('quick');
    expect(summary.quick).toEqual({ skipped: ['coverage', 'crap'], message: QUICK_LINE });
    expect(readFileSync(path.join(outputRoot, 'report.txt'), 'utf8')).toContain(QUICK_LINE);
  });

  it('keeps the meaning of the exit code for a clean quick run and still says it was quick', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/clean.ts': 'export const clean = true;\n',
    });

    const { exitCode, output, outputRoot } = run(repository, ['--quick']);

    expect(exitCode).toBe(0);
    expect(output.stdoutText).toBe(consoleSummary(outputRoot, ['✓ No new enforceable violations']));
  });

  it('does not mention quick mode or write a quick field on a full run', () => {
    const { output, outputRoot } = run(repositoryWithFinding(), []);

    expect(output.stdoutText).not.toContain('Quick run');
    expect(readSummary(outputRoot).quick).toBeUndefined();
    expect(readSummary(outputRoot).mode).toBe('full');
    expect(readSummary(outputRoot).tools.map(({ name }) => name)).toEqual([
      'structure',
      'coverage',
      'crap',
    ]);
  });

  it('narrows to the analyzers that --analyzer names inside the quick set', () => {
    const { exitCode, outputRoot } = run(repositoryWithFinding(), [
      '--quick',
      '--analyzer',
      'structure',
    ]);

    expect(exitCode).toBe(1);
    expect(readSummary(outputRoot).tools.map(({ name }) => name)).toEqual(['structure']);
  });

  it('refuses an --analyzer that quick mode skips', () => {
    const { exitCode, output } = run(repositoryWithFinding(), [
      '--quick',
      '--analyzer',
      'coverage',
    ]);

    expect(exitCode).toBe(2);
    expect(output.stderrText).toBe(
      'nitpicker failed: --analyzer coverage is skipped by --quick. Run it without --quick.\n',
    );
  });

  it('refuses sharding before it runs anything', () => {
    const { exitCode, output } = run(repositoryWithFinding(), [
      '--quick',
      '--shard-count',
      '2',
      '--shard-index',
      '0',
    ]);

    expect(exitCode).toBe(2);
    expect(output.stderrText).toBe(
      'nitpicker failed: --quick cannot be combined with --shard-count or --shard-index: a sharded run is the full gate split across jobs, and a quick run is fast enough for one process.\n',
    );
  });

  it('marks a --all snapshot as quick too', () => {
    const repository = repositoryWithFinding();
    const outputRoot = makeOutputRoot();
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: ['--all', '--quick', '--output', outputRoot],
      environment: { NO_COLOR: '1' },
      currentProjectRoot: repository.root,
      analyzers: ANALYZER_NAMES.map(namedAnalyzer),
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(1);
    expect(output.stdoutText).toContain(QUICK_LINE);
    expect(readSummary(outputRoot).mode).toBe('quick');
    expect(readSummary(outputRoot).quick.skipped).toEqual(['coverage', 'crap']);
    expect(readSummary(outputRoot).tools.map(({ name }) => name)).toEqual(['structure']);
  });
});
