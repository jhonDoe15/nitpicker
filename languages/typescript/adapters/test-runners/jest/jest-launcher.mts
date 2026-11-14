import type { RunnerCommand, TestOptions } from '../typed/runner-types.mts';
import {
  jestArguments as untypedJestArguments,
  jestScriptArguments as untypedJestScriptArguments,
  jestTool as untypedJestTool,
} from '../../../preset/test-environment/jest/jest-launcher.mjs';

export type JestLaunch = {
  readonly tool: { readonly relativeToolPath: string } | { readonly absoluteToolPath: string };
  readonly leading: readonly string[];
  readonly trailing: readonly string[];
};

export const jestTool: (
  options: Pick<TestOptions, 'liveProjectRoot'>,
  launcher: string | undefined,
) => JestLaunch = untypedJestTool;

export const jestScriptArguments: (command: RunnerCommand) => string[] = untypedJestScriptArguments;

export const jestArguments: (
  command: RunnerCommand,
  nitpickerArguments: readonly string[],
  launch: Pick<JestLaunch, 'leading' | 'trailing'>,
) => string[] = untypedJestArguments;
