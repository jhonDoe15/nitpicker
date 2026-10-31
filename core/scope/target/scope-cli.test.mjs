import { mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mjs';
import {
  finding,
  findingLine,
  policy,
} from '../../diff/execution/test-support/analyzer-findings.mjs';
import { captureOutput } from '../../diff/reporting/test-support/output-capture.mjs';
import {
  crashingAnalyzer,
  fakeAnalyzer,
  useCliFixtures,
} from '../../command/test-support/cli-harness.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';

const { createRepository, makeOutputRoot, makeTemporaryRoot, runCli } =
  useCliFixtures(nitpickerCli);

function repositoryWithTwoFolders(extraFiles = {}) {
  const repository = createRepository({
    'quality-policy.json': policy(),
    'src/orders/clean.ts': 'export const clean = true;\n',
    ...extraFiles,
  });
  writeFiles(repository.root, {
    'src/orders/order.ts': findingLine(finding({ identity: 'order-finding' })),
    'src/billing/bill.ts': findingLine(finding({ identity: 'bill-finding' })),
  });
  return repository;
}

function runScoped({
  repository,
  arguments_,
  workingDirectory = repository.root,
  environment = {},
  ...overrides
}) {
  const output = captureOutput();
  const outputRoot = makeOutputRoot();
  const exitCode = runCli({
    arguments_: [...arguments_, '--output', outputRoot],
    environment: { NO_COLOR: '1', ...environment },
    workingDirectory,
    analyzers: [fakeAnalyzer()],
    snapshotAnalyzers: [fakeAnalyzer()],
    stdout: output.stdout,
    stderr: output.stderr,
    ...overrides,
  });
  return { exitCode, output, outputRoot };
}

function readReport(outputRoot, name) {
  return readFileSync(path.join(outputRoot, name), 'utf8');
}

function readSummary(outputRoot) {
  return JSON.parse(readReport(outputRoot, 'summary.json'));
}

function comparisonOutput({ repository, outputRoot }, lines) {
  return [
    `Base: ${repository.baseRef} (argument)`,
    '',
    'Quality gate summary',
    ...lines,
    `Full diagnostics: ${path.join(outputRoot, 'report.txt')}`,
    '',
  ].join('\n');
}

const ORDER_VIOLATION = [
  '✖ 1 new enforceable violation',
  '  fake-quality-analyzer/fixture-rule src/orders/order.ts:1',
  '    Fixture finding',
];

describe('nitpicker with paths', () => {
  it('gates a comparison only on findings under a folder and counts the rest', () => {
    const repository = repositoryWithTwoFolders();

    const { exitCode, output, outputRoot } = runScoped({
      repository,
      arguments_: ['src/orders', '--base', repository.baseRef],
    });

    expect(exitCode).toBe(1);
    expect(output.stdoutText).toBe(
      comparisonOutput({ repository, outputRoot }, [
        'Scope: src/orders (1 finding outside it not shown)',
        ...ORDER_VIOLATION,
      ]),
    );
    const summary = readSummary(outputRoot);
    expect([summary.scope, summary.newEnforceableFindings]).toEqual([
      { paths: ['src/orders'], outside: 1 },
      1,
    ]);
    expect(summary.tools.map((tool) => [tool.name, tool.head, tool.new])).toEqual([
      ['fake-quality-analyzer', 2, 1],
    ]);
    expect(readReport(outputRoot, 'report.txt').split('\n').slice(4, 7)).toEqual([
      'Status: completed',
      'Scope: src/orders (1 finding outside it not shown)',
      'New enforceable findings: 1',
    ]);
    const sarif = JSON.parse(readReport(outputRoot, 'report.sarif'));
    expect(
      sarif.runs.flatMap((run) =>
        run.results.map((result) => result.locations[0].physicalLocation.artifactLocation.uri),
      ),
    ).toEqual(['src/orders/order.ts']);
    expect(
      JSON.parse(readReport(outputRoot, 'new-findings.json')).map((entry) => entry.path),
    ).toEqual(['src/orders/order.ts']);
    expect(output.stderrText).toBe('');
  });

  it('passes when every new finding is outside the paths', () => {
    const repository = repositoryWithTwoFolders();

    const { exitCode, output, outputRoot } = runScoped({
      repository,
      arguments_: ['src/orders/clean.ts', '--base', repository.baseRef],
    });

    expect(exitCode).toBe(0);
    expect(output.stdoutText).toBe(
      comparisonOutput({ repository, outputRoot }, [
        'Scope: src/orders/clean.ts (2 findings outside it not shown)',
        '✓ No new enforceable violations',
      ]),
    );
  });

  it('reads paths relative to the current folder', () => {
    const repository = repositoryWithTwoFolders();

    const { exitCode, outputRoot } = runScoped({
      repository,
      arguments_: ['order.ts', '--base', repository.baseRef],
      workingDirectory: path.join(repository.root, 'src/orders'),
    });

    expect(exitCode).toBe(1);
    expect(readSummary(outputRoot).scope).toEqual({
      paths: ['src/orders/order.ts'],
      outside: 1,
    });
  });

  it('runs the whole project when a path is the project folder', () => {
    const repository = repositoryWithTwoFolders();

    const { exitCode, outputRoot } = runScoped({
      repository,
      arguments_: ['.', '--base', repository.baseRef],
    });

    expect(exitCode).toBe(1);
    const summary = readSummary(outputRoot);
    expect([summary.scope, summary.newEnforceableFindings]).toEqual([undefined, 2]);
  });

  it('finds the project from the first path when run from the repository top', () => {
    const repository = createRepository({
      'services/orders/package.json': '{"name":"orders","version":"1.0.0"}\n',
      'services/orders/quality-policy.json': policy(),
    });
    writeFiles(repository.root, {
      'services/orders/src/order.ts': findingLine(finding({ identity: 'order-finding' })),
      'services/orders/src/other.ts': findingLine(finding({ identity: 'other-finding' })),
    });

    const { exitCode, outputRoot } = runScoped({
      repository,
      arguments_: ['services/orders/src/order.ts', '--base', repository.baseRef],
    });

    expect(exitCode).toBe(1);
    expect(readSummary(outputRoot).scope).toEqual({
      paths: ['src/order.ts'],
      outside: 1,
    });
  });

  it('shows only the findings under a folder with --all', () => {
    const repository = repositoryWithTwoFolders();

    const { exitCode, output, outputRoot } = runScoped({
      repository,
      arguments_: ['--all', 'src/billing'],
    });

    expect(exitCode).toBe(1);
    expect(output.stdoutText).toBe(
      [
        'Nitpicker quality snapshot',
        'Status: violations',
        'Scope: src/billing (1 finding outside it not shown)',
        'Enforceable findings: 1',
        'Descriptive findings: 0',
        'Tool errors: 0',
        '',
        'Per-tool counts:',
        'fake-quality-analyzer: total=1 enforceable=1 descriptive=0',
        '',
        'Enforceable findings:',
        'fake-quality-analyzer/fixture-rule src/billing/bill.ts:1 Fixture finding',
        '',
      ].join('\n'),
    );
    expect(readSummary(outputRoot).scope).toEqual({
      paths: ['src/billing'],
      outside: 1,
    });
  });

  it('passes --all when the folder has no findings', () => {
    const repository = repositoryWithTwoFolders();

    const { exitCode } = runScoped({ repository, arguments_: ['--all', 'src/orders/clean.ts'] });

    expect(exitCode).toBe(0);
  });

  it.each([
    ['a path that does not exist', ['src/missing.ts'], () => 'src/missing.ts matches no file'],
    [
      'a folder with no checked file',
      ['empty'],
      () => 'empty matches no file that nitpicker checks (none tracked or untracked)',
    ],
    ['a path outside the repository', ['..'], (root) => `.. is outside the repository ${root}`],
    [
      'a link that leads outside the repository',
      ['outlink'],
      (root) =>
        `outlink leads to ${realpathSync(path.dirname(root))}, outside the files of ${root}`,
    ],
    [
      'the Git folder',
      ['.git'],
      (root) => `.git leads to ${root}/.git, outside the files of ${root}`,
    ],
    ['an empty path', [''], () => 'A path argument is empty; give a file or folder'],
    [
      'a mistyped option that matches no file',
      ['caches'],
      () => 'caches matches no file. Did you mean cache? Run nitpicker --help for the options.',
    ],
    [
      'a path outside the project of the first path',
      ['services/orders/src', 'src/orders'],
      (root) =>
        `src/orders is outside the project ${root}/services/orders; give paths in one project`,
    ],
    [
      'a path in another project',
      ['src/orders', 'services/orders/src'],
      (root) =>
        `services/orders/src is in the project ${root}/services/orders, not in ${root}; give paths in one project`,
    ],
  ])('refuses %s', (_case, paths, message) => {
    const repository = repositoryWithTwoFolders({
      'services/orders/package.json': '{"name":"orders","version":"1.0.0"}\n',
      'services/orders/src/order.ts': 'export const order = 1;\n',
    });
    mkdirSync(path.join(repository.root, 'empty'));
    symlinkSync(path.dirname(repository.root), path.join(repository.root, 'outlink'));

    const { exitCode, output } = runScoped({
      repository,
      arguments_: [...paths, '--base', repository.baseRef],
    });

    expect(exitCode).toBe(2);
    expect(output.stderrText).toBe(`nitpicker failed: ${message(realpathSync(repository.root))}\n`);
  });

  it('names the scope in the GitHub step summary', () => {
    const repository = repositoryWithTwoFolders();
    const summaryPath = path.join(makeTemporaryRoot('nitpicker-step-summary-'), 'summary.md');
    writeFileSync(summaryPath, '');

    runScoped({
      repository,
      arguments_: ['src/orders', '--base', repository.baseRef],
      environment: { GITHUB_STEP_SUMMARY: summaryPath },
    });
    runScoped({
      repository,
      arguments_: ['--all', 'src/billing'],
      environment: { GITHUB_STEP_SUMMARY: summaryPath },
    });

    const lines = readFileSync(summaryPath, 'utf8').split('\n');
    expect(lines.filter((line) => line.startsWith('Scope: '))).toEqual([
      'Scope: src/orders (1 finding outside it not shown)',
      'Scope: src/billing (1 finding outside it not shown)',
    ]);
  });

  it('still fails on a tool error outside the paths', () => {
    const repository = repositoryWithTwoFolders();

    const { exitCode, outputRoot } = runScoped({
      repository,
      arguments_: ['src/orders/clean.ts', '--base', repository.baseRef],
      analyzers: [crashingAnalyzer()],
    });

    expect(exitCode).toBe(2);
    expect(readSummary(outputRoot).overallStatus).toBe('tool-error');
  });

  it('still fails on a config loosening outside the paths', () => {
    const repository = repositoryWithTwoFolders({
      'nitpicker.config.json': '{"exclude":["src/legacy/**"]}\n',
    });
    writeFiles(repository.root, {
      'nitpicker.config.json': '{"exclude":["src/legacy/**","src/billing/**"]}\n',
    });

    const { exitCode, outputRoot } = runScoped({
      repository,
      arguments_: ['src/orders/clean.ts', '--base', repository.baseRef],
    });

    expect(exitCode).toBe(1);
    expect(
      JSON.parse(readReport(outputRoot, 'new-findings.json')).map(
        (entry) => `${entry.tool}/${entry.rule}`,
      ),
    ).toEqual(['nitpicker-config/policy-loosened']);
  });

  it('fixes only the changed files under the paths', () => {
    const repository = repositoryWithTwoFolders();
    const fixed = [];

    runScoped({
      repository,
      arguments_: ['--fix', 'src/orders', '--base', repository.baseRef],
      executeFixCommand({ operation, args }) {
        if (operation === 'eslint-fix') {
          fixed.push(...args.slice(args.indexOf('--') + 1));
        }
        return { status: 0, stdout: '', stderr: '' };
      },
    });

    expect(fixed).toEqual(['./src/orders/order.ts']);
  });

  it('refuses paths when the current folder is not in a repository', () => {
    const repository = repositoryWithTwoFolders();
    const outside = realpathSync(makeTemporaryRoot('nitpicker-no-repository-'));

    const { exitCode, output } = runScoped({
      repository,
      arguments_: [path.join(repository.root, 'src/orders')],
      workingDirectory: outside,
    });

    expect(exitCode).toBe(2);
    expect(output.stderrText).toBe(
      `nitpicker failed: ${outside} is not in a Git repository; run nitpicker from inside the repository\n`,
    );
  });

  it('refuses paths with --shard-count', () => {
    const repository = repositoryWithTwoFolders();

    const { exitCode, output } = runScoped({
      repository,
      arguments_: ['src/orders', '--shard-count', '2', '--shard-index', '0'],
    });

    expect(exitCode).toBe(2);
    expect(output.stderrText).toBe(
      'nitpicker failed: Paths cannot be combined with --shard-count; shards always cover the whole project\n',
    );
  });
});
