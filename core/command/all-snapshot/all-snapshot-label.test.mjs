import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mts';
import { policy } from '../../diff/execution/test-support/analyzer-findings.mjs';
import { captureOutput } from '../../diff/reporting/test-support/output-capture.mjs';
import { fakeAnalyzer, useCliFixtures } from '../test-support/cli-harness.mjs';
import { runTasksInProcess } from '../../diff/execution/test-support/in-process-analyzers.mjs';

const { createRepository, makeOutputRoot, runCli } = useCliFixtures(nitpickerCli);

describe('nitpicker CLI --all snapshot', () => {
  it('checks the --all snapshot out into a directory named for its head label', () => {
    const repository = createRepository({ 'quality-policy.json': policy() });
    const roots = [];

    runCli({
      arguments_: ['--all', '--output', makeOutputRoot()],
      environment: {},
      currentProjectRoot: repository.root,
      snapshotAnalyzers: [fakeAnalyzer()],
      stdout: captureOutput().stdout,
      stderr: captureOutput().stderr,
      runTasks: (tasks, ...rest) => {
        roots.push(...tasks.map(({ invocation }) => path.basename(invocation.args[2])));
        return runTasksInProcess(tasks, ...rest);
      },
    });

    expect(roots).toEqual(['head']);
  });
});
