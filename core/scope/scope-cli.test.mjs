import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../cli.mjs';
import { finding, findingLine, policy } from '../diff/execution/test-support/analyzer-findings.mjs';
import { captureOutput } from '../diff/reporting/test-support/output-capture.mjs';
import { fakeAnalyzer, useCliFixtures } from '../command/test-support/cli-harness.mjs';
import { writeFiles } from '../diff/git/test-support/fixture-files.mjs';

const { createRepository, makeOutputRoot, runCli } = useCliFixtures(nitpickerCli);

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

function runScoped({ repository, arguments_, workingDirectory = repository.root }) {
  const output = captureOutput();
  const outputRoot = makeOutputRoot();
  const exitCode = runCli({
    arguments_: [...arguments_, '--output', outputRoot],
    environment: { NO_COLOR: '1' },
    workingDirectory,
    analyzers: [fakeAnalyzer()],
    snapshotAnalyzers: [fakeAnalyzer()],
    stdout: output.stdout,
    stderr: output.stderr,
  });
  return { exitCode, output, outputRoot };
}

function readReport(outputRoot, name) {
  return readFileSync(path.join(outputRoot, name), 'utf8');
}

describe('nitpicker with paths', () => {
  it('gates a comparison only on findings under a folder and counts the rest', () => {
    const repository = repositoryWithTwoFolders();

    const { exitCode, output, outputRoot } = runScoped({
      repository,
      arguments_: ['src/orders', '--base', repository.baseRef],
    });

    expect(exitCode).toBe(1);
    expect(output.stdoutText).toContain(
      'Quality gate summary\nScope: src/orders (1 finding outside it not shown)\n',
    );
    expect(output.stdoutText).toContain('src/orders/order.ts:1');
    expect(output.stdoutText).not.toContain('src/billing');
    const summary = JSON.parse(readReport(outputRoot, 'summary.json'));
    expect(summary.scope).toEqual({ paths: ['src/orders'], outside: 1 });
    expect(summary.newEnforceableFindings).toBe(1);
    expect(summary.tools[0]).toMatchObject({ new: 1 });
    expect(readReport(outputRoot, 'report.txt')).toContain(
      'Scope: src/orders (1 finding outside it not shown)',
    );
    expect(readReport(outputRoot, 'report.sarif')).not.toContain('src/billing');
    expect(JSON.parse(readReport(outputRoot, 'new-findings.json'))).toHaveLength(1);
    expect(output.stderrText).toBe('');
  });

  it('passes when every new finding is outside the paths', () => {
    const repository = repositoryWithTwoFolders();

    const { exitCode, output } = runScoped({
      repository,
      arguments_: ['src/orders/clean.ts', '--base', repository.baseRef],
    });

    expect(exitCode).toBe(0);
    expect(output.stdoutText).toContain(
      'Scope: src/orders/clean.ts (2 findings outside it not shown)\n✓ No new enforceable violations',
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
    expect(JSON.parse(readReport(outputRoot, 'summary.json')).scope).toEqual({
      paths: ['src/orders/order.ts'],
      outside: 1,
    });
  });

  it('runs the whole project when a path is the project folder', () => {
    const repository = repositoryWithTwoFolders();

    const { exitCode, output, outputRoot } = runScoped({
      repository,
      arguments_: ['.', '--base', repository.baseRef],
    });

    expect(exitCode).toBe(1);
    expect(output.stdoutText).not.toContain('Scope:');
    expect(JSON.parse(readReport(outputRoot, 'summary.json')).newEnforceableFindings).toBe(2);
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
    expect(JSON.parse(readReport(outputRoot, 'summary.json')).scope).toEqual({
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
    expect(output.stdoutText).toContain(
      'Status: violations\nScope: src/billing (1 finding outside it not shown)\nEnforceable findings: 1\n',
    );
    expect(output.stdoutText).toContain('fake-quality-analyzer: total=1 enforceable=1');
    expect(output.stdoutText).not.toContain('src/orders/order.ts');
    expect(JSON.parse(readReport(outputRoot, 'summary.json')).scope).toEqual({
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
    ['a path that does not exist', ['src/missing.ts'], 'src/missing.ts matches no file'],
    [
      'a folder with no checked file',
      ['empty'],
      'empty matches no file that nitpicker checks (none tracked or untracked)',
    ],
    [
      'a path outside the project of the first path',
      ['services/orders/src', 'src/orders'],
      'src/orders is outside the project',
    ],
    [
      'a path in another project',
      ['src/orders', 'services/orders/src'],
      'services/orders/src is in the project',
    ],
  ])('refuses %s', (_case, paths, message) => {
    const repository = repositoryWithTwoFolders({
      'services/orders/package.json': '{"name":"orders","version":"1.0.0"}\n',
      'services/orders/src/order.ts': 'export const order = 1;\n',
    });
    mkdirSync(path.join(repository.root, 'empty'));

    const { exitCode, output } = runScoped({
      repository,
      arguments_: [...paths, '--base', repository.baseRef],
    });

    expect(exitCode).toBe(2);
    expect(output.stderrText).toContain(`nitpicker failed: ${message}`);
  });

  it('refuses paths with --shard-count', () => {
    const repository = repositoryWithTwoFolders();

    const { exitCode, output } = runScoped({
      repository,
      arguments_: ['src/orders', '--shard-count', '2', '--shard-index', '0'],
    });

    expect(exitCode).toBe(2);
    expect(output.stderrText).toContain('Paths cannot be combined with --shard-count');
  });
});
