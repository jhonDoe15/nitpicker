import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REPORT_FILE_NAMES } from '../../../reporting/reporters.mts';
import {
  commitFiles,
  comparisonOptions,
  useQualityDiffRepositories,
  fakeAnalyzer,
  IN_PROCESS_TASKS,
  worktreePaths,
} from '../test-support/quality-diff-harness.mts';
import { runCli } from '../../../../cli.mts';
import type { DiffReport } from '../../../comparison/results.mts';
import { type DiffOptions, runQualityDiff } from '../../../comparison/run-diff.mts';
import { captureOutput } from '../../../reporting/test-support/output-capture.mts';
import {
  finding,
  findingLine,
  policy,
} from '../../../execution/test-support/analyzer-findings.mts';
import { fieldAt } from '../../../../../scripts/json/fields.mts';
import { fieldOf, listOf, parseJson, textOf } from '../../../../../shared/values/readers.mts';
import { readJson, writeFiles } from '../../../git/test-support/fixture-files.mts';
import { linkSentence } from '../../../../../shared/messages/test-support/link-sentence.mjs';

const TIMEOUT_MESSAGE =
  'fake-quality-analyzer timed out after 100 ms. To give it more time, set ' +
  '"analyzerTimeoutMinutes": { "fake-quality-analyzer": <minutes> } in nitpicker.config.json. ' +
  textOf(linkSentence('analyzerTimeout'));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, rmSync: vi.fn(actual.rmSync) };
});

const { createRepository } = useQualityDiffRepositories();
const looseDiff: {
  run(
    options: Omit<DiffOptions, 'analyzers'> & { readonly analyzers: readonly unknown[] },
  ): DiffReport;
} = { run: runQualityDiff };
const { rmSync: actualRmSync } = await vi.importActual<typeof import('node:fs')>('node:fs');
const leftovers: string[] = [];

afterEach(() => {
  vi.mocked(rmSync).mockImplementation(actualRmSync);
  for (const leftover of leftovers.splice(0)) {
    actualRmSync(leftover, { recursive: true, force: true });
  }
});

function keepWritingIntoWorktrees() {
  vi.mocked(rmSync).mockImplementation((target, options) => {
    const targetPath = String(target);
    if (path.basename(targetPath).startsWith('nitpicker-diff-')) {
      leftovers.push(targetPath);
      throw new Error(`ENOTEMPTY: directory not empty, rmdir '${targetPath}'`);
    }
    actualRmSync(targetPath, options);
  });
}

describe('quality diff temporary worktrees and reports', () => {
  it.each(['crash', 'malformed'])(
    'returns exit 2, writes tool errors, and removes worktrees after analyzer %s',
    (mode) => {
      const repository = createRepository({
        'quality-policy.json': policy(),
        'src/main/source.ts': 'export const source = true;\n',
      });
      commitFiles(
        repository.root,
        { 'quality-policy.json': policy({ mode }) },
        `configure ${mode}`,
      );
      const output = captureOutput();

      const exitCode = runCli({
        ...IN_PROCESS_TASKS,
        arguments_: ['--base', repository.baseRef, '--output', 'reports/quality/diff'],
        environment: {},
        currentProjectRoot: repository.root,
        analyzers: [fakeAnalyzer()],
        stdout: output.stdout,
        stderr: output.stderr,
        runTasks: undefined,
      });

      expect(exitCode).toBe(2);
      expect(readJson(repository.root, 'reports/quality/diff/tool-errors.json')).toHaveLength(2);
      expect(worktreePaths(repository.root)).toEqual([repository.root]);
    },
  );
  it('times out a hanging analyzer and removes both temporary worktrees', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/source.ts': 'export const source = true;\n',
    });
    commitFiles(repository.root, { 'quality-policy.json': policy({ mode: 'hang' }) }, 'hang');
    const output = captureOutput();

    const exitCode = runCli({
      ...IN_PROCESS_TASKS,
      arguments_: ['--base', repository.baseRef, '--output', 'reports/quality/diff'],
      environment: {},
      currentProjectRoot: repository.root,
      analyzers: [fakeAnalyzer({ timeoutMs: 100 })],
      stdout: output.stdout,
      stderr: output.stderr,
      runTasks: undefined,
    });

    expect(exitCode).toBe(2);
    expect(readJson(repository.root, 'reports/quality/diff/tool-errors.json')).toEqual([
      {
        tool: 'fake-quality-analyzer',
        snapshot: 'base',
        message: TIMEOUT_MESSAGE,
      },
      {
        tool: 'fake-quality-analyzer',
        snapshot: 'head',
        message: TIMEOUT_MESSAGE,
      },
    ]);
    expect(worktreePaths(repository.root)).toEqual([repository.root]);
  });
  it('keeps the report and the timeout when a killed build still writes into the worktree', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/source.ts': 'export const source = true;\n',
    });
    commitFiles(repository.root, { 'quality-policy.json': policy({ mode: 'hang' }) }, 'hang');
    const output = captureOutput();
    const progress = captureOutput();
    keepWritingIntoWorktrees();

    const exitCode = runCli({
      ...IN_PROCESS_TASKS,
      arguments_: ['--base', repository.baseRef, '--output', 'reports/quality/diff'],
      environment: {},
      currentProjectRoot: repository.root,
      analyzers: [fakeAnalyzer({ timeoutMs: 100 })],
      stdout: output.stdout,
      stderr: output.stderr,
      progress: progress.stderr,
      runTasks: undefined,
    });

    expect(exitCode).toBe(2);
    expect(
      listOf(readJson(repository.root, 'reports/quality/diff/tool-errors.json')).map((entry) =>
        fieldOf(entry, 'message'),
      ),
    ).toEqual([TIMEOUT_MESSAGE, TIMEOUT_MESSAGE]);
    expect(output.stdoutText.split('\n', 1)).toEqual([`Base: ${repository.baseRef} (argument)`]);
    expect(output.stderrText).toBe(
      leftovers
        .map(
          (leftover) =>
            `nitpicker: could not remove the temporary worktree ${leftover} (ENOTEMPTY: directory not empty, rmdir '${leftover}'); delete it and run git worktree prune once the build has stopped\n`,
        )
        .join(''),
    );
    expect(leftovers).toHaveLength(2);
  });
  it('removes stale reports before an invalid-ref failure', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/source.ts': 'export const source = true;\n',
    });
    writeFiles(
      repository.root,
      Object.fromEntries(
        REPORT_FILE_NAMES.map((reportFileName) => [
          `reports/quality/diff/${reportFileName}`,
          'stale\n',
        ]),
      ),
    );
    const output = captureOutput();

    const exitCode = runCli({
      ...IN_PROCESS_TASKS,
      arguments_: ['--base', 'missing-ref'],
      environment: {},
      currentProjectRoot: repository.root,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(2);
    expect(REPORT_FILE_NAMES.includes('summary.json')).toBe(true);
    expect(
      REPORT_FILE_NAMES.map((name) => existsSync(path.join(repository.outputRoot, name))),
    ).toEqual(REPORT_FILE_NAMES.map(() => false));
  });
  it('reports malformed analyzer configuration without leaking worktrees', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/source.ts': 'export const source = true;\n',
    });
    commitFiles(repository.root, { 'head.txt': 'head\n' }, 'head');

    const report = looseDiff.run({
      ...IN_PROCESS_TASKS,
      repositoryRoot: repository.root,
      projectRelativePath: '.',
      headProjectRoot: repository.root,
      requestedBaseRef: repository.baseRef,
      outputRoot: repository.outputRoot,
      analyzers: [parseJson('null')],
    });

    expect(fieldAt(report.summary, 'overallStatus')).toBe('tool-error');
    expect(report.toolErrors).toEqual([
      {
        tool: 'unknown-analyzer-0',
        snapshot: 'base',
        message: 'Analyzer configuration must be an object',
      },
      {
        tool: 'unknown-analyzer-0',
        snapshot: 'head',
        message: 'Analyzer configuration must be an object',
      },
    ]);
    expect(worktreePaths(repository.root)).toEqual([repository.root]);
  });
  it('removes temporary worktrees and writes every report after success', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/stable.ts': findingLine(finding({ identity: 'stable' })),
    });
    commitFiles(repository.root, { 'head.txt': 'head\n' }, 'head');

    const report = runQualityDiff(comparisonOptions(repository));

    expect(fieldAt(report.summary, 'overallStatus')).toBe('completed');
    expect(worktreePaths(repository.root)).toEqual([repository.root]);
    expect(REPORT_FILE_NAMES.includes('summary.json')).toBe(true);
    expect(
      REPORT_FILE_NAMES.map((name) => existsSync(path.join(repository.outputRoot, name))),
    ).toEqual(REPORT_FILE_NAMES.map(() => true));
  });
});
