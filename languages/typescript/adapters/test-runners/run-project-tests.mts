import { projectTestRunner } from './typed/runner-tools.mts';
import type { RunnerCommand, TestOptions, TestRun } from './typed/runner-types.mts';
import { runJest } from './jest/jest.mts';
import { runMocha } from './mocha/mocha.mts';
import { runNodeTest } from './node-test/node-test.mts';
import { runVitest } from './vitest/vitest.mts';

type ProjectTestRun = TestRun & { readonly runner: string; readonly precedingCommands: unknown };

const ADAPTERS = {
  vitest: runVitest,
  jest: runJest,
  node: runNodeTest,
  mocha: runMocha,
} satisfies Record<string, (options: TestOptions, command: RunnerCommand) => unknown>;

export async function runProjectTests(options: TestOptions): Promise<ProjectTestRun> {
  const { runner, command } = projectTestRunner(options);
  return {
    runner,
    precedingCommands: command.precedingCommands,
    ...(await ADAPTERS[runner](options, command)),
  };
}
