import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mts';
import {
  finding,
  findingLine,
  policy,
} from '../../diff/execution/test-support/analyzer-findings.mjs';
import { captureOutput } from '../../diff/reporting/test-support/output-capture.mjs';
import { maskedDiagnostics } from '../../diff/reporting/test-support/output-expectations.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';
import { fakeAnalyzer, useCliFixtures } from '../test-support/cli-harness.mjs';

const { createRepository, makeOutputRoot, runCli } = useCliFixtures(nitpickerCli);
const FIRST = 'src/main/billing/first.ts';
const SECOND = 'src/main/orders/second.ts';
const LONG_MESSAGE = 'Fixture finding. A second sentence that only --details prints in full.';
const WARNING =
  'Warning: the working tree changed since this run, so these results may be out of date. Run nitpicker again.\n';
const COMPARISON_HEADER =
  'Showing the last comparison: base comparison-base, head <sha>, run at <time>\n';
const SNAPSHOT_HEADER = 'Showing the last --all run: head <sha>, run at <time>\n';
const DIAGNOSTICS = 'Full diagnostics: <report>\n';
const BILLING = `  fake-quality-analyzer/billing-rule: ${LONG_MESSAGE}\n    src/main/billing/first.ts:1:4\n`;
const ORDERS =
  '  fake-quality-analyzer/orders-rule: Fixture finding\n    src/main/orders/second.ts:1:4\n';
const TWO_VIOLATIONS = `Quality gate summary\n✖ 2 new enforceable violations\n${BILLING}${ORDERS}`;
const BY_ANALYZER = 'By analyzer:\n  fake-quality-analyzer: 2 enforceable, 0 descriptive\n';
const HELP_TEXT = [
  'Usage: nitpicker show [--all] [--rule <substring>]... [--path <file or folder>] [--details]' +
    ' [--output <dir>]',
  '',
  'Prints the summary of the last run again, without running any analyzer: the comparison in',
  'reports/quality/diff/, or the --all run in reports/quality/snapshot/ with --all (or when there',
  'is no comparison). --rule, --path and --details work as they do for a run. A warning says when',
  'the working tree changed since that run.',
  '',
  'Exit codes: 0 when the run passed; 1 when it had new enforceable findings, failing tests or a',
  'tool error; 2 when there is no report to show (run nitpicker first).',
  '',
].join('\n');

function failingRepository() {
  const repository = createRepository({
    'quality-policy.json': policy(),
    'src/main/clean.ts': 'export const clean = true;\n',
  });
  writeFiles(repository.root, {
    [FIRST]: findingLine(
      finding({ rule: 'billing-rule', identity: 'first', message: LONG_MESSAGE }),
    ),
    [SECOND]: findingLine(finding({ rule: 'orders-rule', identity: 'second' })),
  });
  return repository;
}

function execute(repository, arguments_, extra = {}) {
  const output = captureOutput();
  const exitCode = runCli({
    arguments_,
    currentProjectRoot: repository.root,
    workingDirectory: repository.root,
    analyzers: [fakeAnalyzer()],
    snapshotAnalyzers: [fakeAnalyzer()],
    stdout: output.stdout,
    stderr: output.stderr,
    runTasks: undefined,
    ...extra,
  });
  return { exitCode, stdout: output.stdoutText, stderr: output.stderrText };
}

function runThenShow(showArguments = [], { all = false } = {}) {
  const repository = failingRepository();
  const outputRoot = makeOutputRoot();
  const run = execute(repository, [
    ...(all ? ['--all'] : ['--base', repository.baseRef]),
    '--output',
    outputRoot,
  ]);
  const shown = execute(repository, [
    'show',
    ...(all ? ['--all'] : []),
    '--output',
    outputRoot,
    ...showArguments,
  ]);
  return { repository, outputRoot, run, shown };
}

function normalized(stdout) {
  return stdout
    .replace(/head [0-9a-f]{12}/u, 'head <sha>')
    .replace(/run at \S+/u, 'run at <time>')
    .replace(/\([0-9a-f]{12}\)/u, '(<sha>)')
    .replace(/Full diagnostics: .*\n/u, DIAGNOSTICS);
}

function summaryOf(stdout) {
  return stdout.slice(stdout.indexOf('\nQuality'));
}

describe('nitpicker show after a failing comparison', () => {
  it('prints the console summary of the run again, names the run and exits 1', () => {
    const { run, shown } = runThenShow();

    expect(run.exitCode).toBe(1);
    expect(shown.exitCode).toBe(1);
    expect(shown.stderr).toBe('');
    expect(normalized(shown.stdout)).toBe(`${COMPARISON_HEADER}\n${TWO_VIOLATIONS}${DIAGNOSTICS}`);
    expect(summaryOf(shown.stdout)).toBe(summaryOf(run.stdout.replace(/^Base: .*\n/u, '')));
  });

  it('reads the default report folder without --output', () => {
    const repository = failingRepository();
    execute(repository, ['--base', repository.baseRef]);

    const shown = execute(repository, ['show']);

    expect(shown.exitCode).toBe(1);
    expect(shown.stdout.split('\n').at(-2)).toBe(
      `Full diagnostics: ${path.join(repository.root, 'reports/quality/diff/report.txt')}`,
    );
    expect(normalized(shown.stdout)).toBe(`${COMPARISON_HEADER}\n${TWO_VIOLATIONS}${DIAGNOSTICS}`);
  });

  it('keeps the findings of a rule with --rule, and takes it more than once', () => {
    const { shown } = runThenShow(['--rule', 'billing']);
    const both = runThenShow(['--rule', 'billing', '--rule', 'orders-rule']).shown;

    expect(normalized(shown.stdout)).toBe(
      `${COMPARISON_HEADER}Filtered by --rule billing.\n\n` +
        `Quality gate summary\n✖ 1 new enforceable violation\n${BILLING}${DIAGNOSTICS}`,
    );
    expect(normalized(both.stdout)).toBe(
      `${COMPARISON_HEADER}Filtered by --rule billing, orders-rule.\n\n${TWO_VIOLATIONS}${DIAGNOSTICS}`,
    );
    expect(shown.exitCode).toBe(1);
  });

  it('keeps the findings under a file or folder with --path, relative to the current folder', () => {
    const folder = runThenShow(['--path', 'src/main/orders']).shown;
    const file = runThenShow(['--path', FIRST]).shown;

    expect(normalized(folder.stdout)).toBe(
      `${COMPARISON_HEADER}Filtered by --path src/main/orders.\n\n` +
        `Quality gate summary\n✖ 1 new enforceable violation\n${ORDERS}${DIAGNOSTICS}`,
    );
    expect(normalized(file.stdout)).toBe(
      `${COMPARISON_HEADER}Filtered by --path ${FIRST}.\n\n` +
        `Quality gate summary\n✖ 1 new enforceable violation\n${BILLING}${DIAGNOSTICS}`,
    );
  });

  it('says so when nothing matches the filters, and still exits with the run result', () => {
    const { shown } = runThenShow(['--rule', 'no-such-rule']);

    expect(normalized(shown.stdout)).toBe(
      `${COMPARISON_HEADER}Filtered by --rule no-such-rule.\nNo findings match the filters.\n`,
    );
    expect(shown.exitCode).toBe(1);
  });

  it('prints every finding with its full message with --details', () => {
    const detailed = runThenShow(['--details']).shown;

    expect(normalized(detailed.stdout)).toBe(
      `${COMPARISON_HEADER}\nQuality gate summary\n✖ 2 new enforceable violations\n` +
        `  fake-quality-analyzer/billing-rule ${FIRST}:1\n    ${LONG_MESSAGE}\n` +
        `  fake-quality-analyzer/orders-rule ${SECOND}:1\n    Fixture finding\n${DIAGNOSTICS}`,
    );
  });

  it('rejects a path outside the project and an unknown option', () => {
    const { repository, outputRoot } = runThenShow();

    const outside = execute(repository, ['show', '--output', outputRoot, '--path', '../elsewhere']);
    const unknown = execute(repository, ['show', '--output', outputRoot, '--rules', 'x']);

    expect([outside.exitCode, unknown.exitCode]).toEqual([2, 2]);
    expect(outside.stderr).toBe(
      `nitpicker failed: --path ../elsewhere is outside the project ${repository.root}\n`,
    );
    expect(unknown.stderr).toBe(
      'nitpicker failed: Unknown argument: --rules. Did you mean --rule? ' +
        'Usage: nitpicker show [--all] [--rule <substring>]... [--path <file or folder>] ' +
        '[--details] [--output <dir>]\n',
    );
  });

  it('warns in one line when the working tree changed since the run', () => {
    const { repository, outputRoot } = runThenShow();
    writeFileSync(path.join(repository.root, 'src/main/clean.ts'), 'export const clean = false;\n');

    const shown = execute(repository, ['show', '--output', outputRoot]);

    expect(normalized(shown.stdout)).toBe(
      `${COMPARISON_HEADER}${WARNING}\n${TWO_VIOLATIONS}${DIAGNOSTICS}`,
    );
    expect(shown.exitCode).toBe(1);
  });

  it('warns about a new untracked file too', () => {
    const { repository, outputRoot } = runThenShow();
    writeFiles(repository.root, { 'src/main/extra.ts': 'export const extra = 1;\n' });

    expect(normalized(execute(repository, ['show', '--output', outputRoot]).stdout)).toBe(
      `${COMPARISON_HEADER}${WARNING}\n${TWO_VIOLATIONS}${DIAGNOSTICS}`,
    );
  });

  it('exits 0 for a run that found nothing to check', () => {
    const repository = createRepository({ 'quality-policy.json': policy() });
    const outputRoot = makeOutputRoot();
    execute(repository, ['--base', repository.baseRef, '--output', outputRoot]);

    const shown = execute(repository, ['show', '--output', outputRoot]);

    expect(shown.exitCode).toBe(0);
    expect(normalized(shown.stdout)).toBe(
      `${COMPARISON_HEADER}No changes since comparison-base (<sha>); nothing to check.\n`,
    );
  });
});

describe('nitpicker show with filters and a failed run', () => {
  it('keeps the tool errors in the filtered view instead of saying nothing matches', () => {
    const { repository, outputRoot } = runThenShow();
    writeFileSync(
      path.join(outputRoot, 'tool-errors.json'),
      JSON.stringify([{ tool: 'coverage', snapshot: 'head', message: 'coverage crashed: ENOENT' }]),
    );

    const shown = execute(repository, ['show', '--output', outputRoot, '--rule', 'no-such-rule']);

    expect(normalized(shown.stdout)).toBe(
      `${COMPARISON_HEADER}Filtered by --rule no-such-rule.\n\n` +
        'Quality gate summary\nNo new enforceable violations, but the run is incomplete:\n' +
        '✖ 1 tool error\n  coverage (head): ENOENT\n' +
        'Help with tool errors: https://github.com/jhonDoe15/nitpicker/blob/main/docs/troubleshooting.md#exit-code-2-and-tool-errors\n' +
        DIAGNOSTICS,
    );
    expect(shown.exitCode).toBe(1);
  });
});

describe('nitpicker show when both kinds of report exist', () => {
  it('shows the newer one and names it', () => {
    const repository = failingRepository();
    execute(repository, ['--base', repository.baseRef]);
    execute(repository, ['--all']);

    const afterSnapshot = execute(repository, ['show']);
    execute(repository, ['--base', repository.baseRef]);
    const afterDiff = execute(repository, ['show']);

    expect(normalized(afterSnapshot.stdout).split('\n')[0]).toBe(SNAPSHOT_HEADER.trimEnd());
    expect(normalized(afterDiff.stdout).split('\n')[0]).toBe(COMPARISON_HEADER.trimEnd());
  });
});

describe('nitpicker show without a report', () => {
  it('exits 2 and says to run nitpicker first', () => {
    const repository = createRepository({ 'quality-policy.json': policy() });
    const outputRoot = makeOutputRoot();

    const shown = execute(repository, ['show', '--output', outputRoot]);

    expect(shown).toEqual({
      exitCode: 2,
      stdout: '',
      stderr: `nitpicker show: no report in ${outputRoot}. Run nitpicker first.\n`,
    });
  });

  it('prints its usage with --help', () => {
    const repository = createRepository({ 'quality-policy.json': policy() });

    const help = execute(repository, ['show', '--help']);

    expect(help).toEqual({ exitCode: 0, stdout: HELP_TEXT, stderr: '' });
  });
});

describe('nitpicker show after an --all run', () => {
  it('prints the snapshot summary, filters it and exits 1', () => {
    const { run, shown, repository, outputRoot } = runThenShow([], { all: true });
    const filtered = execute(repository, [
      'show',
      '--all',
      '--output',
      outputRoot,
      '--path',
      'src/main/billing',
    ]);

    expect(run.exitCode).toBe(1);
    expect(normalized(shown.stdout)).toBe(
      `${SNAPSHOT_HEADER}\nQuality snapshot summary\n✖ 2 enforceable findings\n${BILLING}${ORDERS}` +
        `${BY_ANALYZER}${DIAGNOSTICS}`,
    );
    expect(maskedDiagnostics(summaryOf(shown.stdout))).toBe(
      maskedDiagnostics(summaryOf(run.stdout)),
    );
    expect(shown.exitCode).toBe(1);
    expect(normalized(filtered.stdout)).toBe(
      `${SNAPSHOT_HEADER}Filtered by --path src/main/billing.\n\n` +
        `Quality snapshot summary\n✖ 1 enforceable finding\n${BILLING}${BY_ANALYZER}${DIAGNOSTICS}`,
    );
  });

  it('is what show finds when there is no comparison report', () => {
    const repository = failingRepository();
    execute(repository, ['--all']);

    const shown = execute(repository, ['show']);
    const summary = JSON.parse(
      readFileSync(path.join(repository.root, 'reports/quality/snapshot/summary.json'), 'utf8'),
    );

    expect(normalized(shown.stdout)).toBe(
      `${SNAPSHOT_HEADER}\nQuality snapshot summary\n✖ 2 enforceable findings\n${BILLING}${ORDERS}` +
        `${BY_ANALYZER}${DIAGNOSTICS}`,
    );
    expect(shown.exitCode).toBe(1);
    expect(summary.workingTree).toMatch(/^[0-9a-f]{64}$/u);
  });
});
