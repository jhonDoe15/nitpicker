import { exactText } from '../../../reporting/test-support/output-expectations.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  commitFiles,
  useQualityDiffRepositories,
  fakeAnalyzer,
  IN_PROCESS_TASKS,
} from '../test-support/quality-diff-harness.mjs';
import { runCli } from '../../../../cli.mjs';
import { captureOutput } from '../../../reporting/test-support/output-capture.mjs';
import {
  finding,
  findingLine,
  policy,
} from '../../../execution/test-support/analyzer-findings.mjs';
import { readJson } from '../../../git/test-support/fixture-files.mjs';

const { createRepository } = useQualityDiffRepositories();

describe('quality diff command-line gate', () => {
  it('exits zero when the branch introduces no new enforceable findings', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/stable.ts': findingLine(finding({ identity: 'stable' })),
    });
    commitFiles(repository.root, { 'head.txt': 'head\n' }, 'head');
    const output = captureOutput();

    const exitCode = runCli({
      ...IN_PROCESS_TASKS,
      arguments_: ['--base', repository.baseRef, '--output', 'reports/quality/diff'],
      environment: {},
      currentProjectRoot: repository.root,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(0);
    expect(output.stdoutText).toEqual(`Base: ${repository.baseRef} (argument)

\u001b[1m\u001b[32mQuality gate summary\u001b[0m
\u001b[32m✓ No new enforceable violations\u001b[0m
\u001b[2mFull diagnostics: ${repository.outputRoot}/report.txt\u001b[0m
`);
    expect(output.stdoutText).not.toContain('Per-tool counts:');
    expect(readFileSync(path.join(repository.outputRoot, 'report.txt'), 'utf8')).toEqual(
      expect.stringMatching(exactText`Nitpicker quality diff
Base ref: comparison-base
Merge base: ${/[a-f0-9]{40}/}
Head: ${/[a-f0-9]{40}/}
Status: completed
New enforceable findings: 0
New findings: 0
Resolved findings: 0
Unchanged findings: 1
Changed metrics: 0
Tool errors: 0

Per-tool counts:
fake-quality-analyzer: base=1 head=1 new=0 resolved=0 unchanged=1 changed-metrics=0 elapsed=${/[0-9]+(?:\.[0-9]+)?/}s
`),
    );
  });
  it('exits nonzero when the branch introduces a new enforceable finding', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/stable.ts': findingLine(finding({ identity: 'stable' })),
    });
    commitFiles(
      repository.root,
      { 'src/main/new.ts': findingLine(finding({ identity: 'introduced' })) },
      'introduce finding',
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
    });

    expect(exitCode).toBe(1);
    expect(output.stdoutText).toEqual(`Base: ${repository.baseRef} (argument)

\u001b[1m\u001b[31mQuality gate summary\u001b[0m
\u001b[1m\u001b[31m✖ 1 new enforceable violation\u001b[0m
  \u001b[33mfake-quality-analyzer/fixture-rule\u001b[0m: Fixture finding
    src/main/new.ts:1:4
\u001b[2mFull diagnostics: ${repository.outputRoot}/report.txt\u001b[0m
`);
    expect(output.stdoutText).not.toContain('Per-tool counts:');
  });
  it('defers a shard finding exit after writing its report', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/stable.ts': findingLine(finding({ identity: 'stable' })),
    });
    commitFiles(
      repository.root,
      { 'src/main/new.ts': findingLine(finding({ identity: 'introduced' })) },
      'introduce finding',
    );
    const output = captureOutput();

    const exitCode = runCli({
      ...IN_PROCESS_TASKS,
      arguments_: [
        '--base',
        repository.baseRef,
        '--output',
        'reports/quality/diff/0',
        '--shard-count',
        '1',
        '--shard-index',
        '0',
        '--defer-exit',
      ],
      environment: {},
      currentProjectRoot: repository.root,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(0);
    expect(readJson(repository.root, 'reports/quality/diff/0/new-findings.json')).toHaveLength(1);
  });
  it('does not fail on a new finding that is merely descriptive', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/stable.ts': findingLine(finding({ identity: 'stable' })),
    });
    commitFiles(
      repository.root,
      {
        'src/main/new.ts': findingLine(
          finding({
            identity: 'introduced-metric',
            classification: 'descriptive',
            metric: { name: 'fanIn', value: 3 },
          }),
        ),
      },
      'introduce descriptive finding',
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
    });

    expect(exitCode).toBe(0);
    expect(output.stdoutText).toEqual(`Base: ${repository.baseRef} (argument)

\u001b[1m\u001b[32mQuality gate summary\u001b[0m
\u001b[32m✓ No new enforceable violations\u001b[0m
\u001b[2mFull diagnostics: ${repository.outputRoot}/report.txt\u001b[0m
`);
    expect(output.stdoutText).not.toContain('introduced-metric');
  });
  it('restricts the run to a named analyzer with --analyzer', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/source.ts': 'export const source = true;\n',
    });
    commitFiles(repository.root, { 'head.txt': 'head\n' }, 'head');
    const output = captureOutput();

    const exitCode = runCli({
      ...IN_PROCESS_TASKS,
      arguments_: [
        '--base',
        repository.baseRef,
        '--output',
        'reports/quality/diff',
        '--analyzer',
        'fake-quality-analyzer',
      ],
      environment: {},
      currentProjectRoot: repository.root,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(0);
    expect(output.stdoutText).toEqual(`Base: ${repository.baseRef} (argument)

\u001b[1m\u001b[32mQuality gate summary\u001b[0m
\u001b[32m✓ No new enforceable violations\u001b[0m
\u001b[2mFull diagnostics: ${repository.outputRoot}/report.txt\u001b[0m
`);
    expect(readJson(repository.root, 'reports/quality/diff/summary.json').tools).toEqual([
      {
        name: 'fake-quality-analyzer',
        version: '1.0.0',
        configurationHash: 'fixture-policy',
        base: 0,
        head: 0,
        new: 0,
        resolved: 0,
        unchanged: 0,
        changedMetrics: 0,
        baseElapsedMs: expect.any(Number),
        headElapsedMs: expect.any(Number),
        elapsedMs: expect.any(Number),
      },
    ]);
  });
  it('rejects an unknown --analyzer name instead of silently running everything', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/source.ts': 'export const source = true;\n',
    });
    commitFiles(repository.root, { 'head.txt': 'head\n' }, 'head');
    const output = captureOutput();

    const exitCode = runCli({
      ...IN_PROCESS_TASKS,
      arguments_: ['--base', repository.baseRef, '--analyzer', 'does-not-exist'],
      environment: {},
      currentProjectRoot: repository.root,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(2);
    expect(output.stderrText).toEqual(
      'nitpicker failed: Unknown --analyzer: does-not-exist. Known analyzers: fake-quality-analyzer\n',
    );
  });
  it('prints a drill-down section for findings matching --rule', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/stable.ts': findingLine(finding({ identity: 'stable', rule: 'match-me' })),
    });
    commitFiles(
      repository.root,
      {
        'src/main/new.ts': findingLine(finding({ identity: 'introduced', rule: 'match-me' })),
      },
      'introduce finding',
    );
    const output = captureOutput();

    const exitCode = runCli({
      ...IN_PROCESS_TASKS,
      arguments_: [
        '--base',
        repository.baseRef,
        '--output',
        'reports/quality/diff',
        '--rule',
        'match-me',
      ],
      environment: {},
      currentProjectRoot: repository.root,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(1);
    expect(output.stdoutText).toEqual(`Base: ${repository.baseRef} (argument)

\u001b[1m\u001b[31mQuality gate summary\u001b[0m
\u001b[1m\u001b[31m✖ 1 new enforceable violation\u001b[0m
  \u001b[33mfake-quality-analyzer/match-me\u001b[0m: Fixture finding
    src/main/new.ts:1:4
\u001b[2mFull diagnostics: ${repository.outputRoot}/report.txt\u001b[0m

Findings matching --rule match-me:

  New:
fake-quality-analyzer/match-me src/main/new.ts:1 Fixture finding

  Unchanged:
fake-quality-analyzer/match-me src/main/stable.ts:1 Fixture finding
`);
  });
  it('does not report success before real analyzer adapters are configured', () => {
    const output = captureOutput();
    const repository = createRepository({ 'src/service.ts': 'export const service = 1;\n' });

    const exitCode = runCli({
      ...IN_PROCESS_TASKS,
      arguments_: ['--base', 'origin/master'],
      environment: {},
      currentProjectRoot: repository.root,
      analyzers: [],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(2);
    expect(output.stderrText).toEqual(
      'nitpicker failed: No quality analyzers are configured. The comparison framework is ready, but real analyzer adapters are a later phase.\n',
    );
  });
});
