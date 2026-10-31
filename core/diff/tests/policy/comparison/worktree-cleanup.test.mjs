import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPORT_FILE_NAMES } from '../../../reporting/reporters.mjs';
import {
  commitFiles,
  comparisonOptions,
  useQualityDiffRepositories,
  fakeAnalyzer,
  IN_PROCESS_TASKS,
  worktreePaths,
} from '../test-support/quality-diff-harness.mjs';
import { runCli } from '../../../../cli.mjs';
import { runQualityDiff } from '../../../comparison/run-diff.mjs';
import { captureOutput } from '../../../reporting/test-support/output-capture.mjs';
import {
  finding,
  findingLine,
  policy,
} from '../../../execution/test-support/analyzer-findings.mjs';
import { readJson, writeFiles } from '../../../git/test-support/fixture-files.mjs';

const { createRepository } = useQualityDiffRepositories();

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
        message:
          'fake-quality-analyzer timed out after 100 ms. To give it more time, set ' +
          '"analyzerTimeoutMinutes": { "fake-quality-analyzer": <minutes> } in nitpicker.config.json',
      },
      {
        tool: 'fake-quality-analyzer',
        snapshot: 'head',
        message:
          'fake-quality-analyzer timed out after 100 ms. To give it more time, set ' +
          '"analyzerTimeoutMinutes": { "fake-quality-analyzer": <minutes> } in nitpicker.config.json',
      },
    ]);
    expect(worktreePaths(repository.root)).toEqual([repository.root]);
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
    expect(REPORT_FILE_NAMES).not.toHaveLength(0);
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

    const report = runQualityDiff({
      ...IN_PROCESS_TASKS,
      repositoryRoot: repository.root,
      projectRelativePath: '.',
      headProjectRoot: repository.root,
      requestedBaseRef: repository.baseRef,
      outputRoot: repository.outputRoot,
      analyzers: [null],
    });

    expect(report.summary.overallStatus).toBe('tool-error');
    expect(report.toolErrors).toEqual([
      {
        tool: 'unknown-analyzer-0',
        snapshot: 'base',
        message: "Cannot read properties of null (reading 'resolveVersion')",
      },
      {
        tool: 'unknown-analyzer-0',
        snapshot: 'head',
        message: "Cannot read properties of null (reading 'resolveVersion')",
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

    expect(report.summary.overallStatus).toBe('completed');
    expect(worktreePaths(repository.root)).toEqual([repository.root]);
    expect(REPORT_FILE_NAMES).not.toHaveLength(0);
    expect(
      REPORT_FILE_NAMES.map((name) => existsSync(path.join(repository.outputRoot, name))),
    ).toEqual(REPORT_FILE_NAMES.map(() => true));
  });
});
