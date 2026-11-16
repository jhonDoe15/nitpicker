import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { failure } from '../adapters/execution/python-process.mts';
import type { FixInvocation } from '../../../core/fix/typed/fix-types.mts';
import type { NitpickerConfig } from '../../../shared/values/config-types.mts';
import type { SpawnResult } from '../adapters/execution/typed/process-types.mts';
import type { ToolContext } from '../adapters/typed/context/tool-context-types.mts';
import {
  fixSpawn,
  runFixCommand,
  toolPrecedenceOf,
  trackTemporaryPath,
  untrackTemporaryPath,
} from '../../../core/fix/typed/fix-views.mts';
import { createToolContext } from '../adapters/python-tools.mts';

export type ProbeInvocation = { operation?: string };
export type ExecuteFixCommand = (invocation: FixInvocation & ProbeInvocation) => unknown;
export type FixPolicy = {
  readonly exclude?: string[];
  readonly conventions?: Readonly<Record<string, unknown>>;
  readonly tools?: Readonly<Record<string, { readonly precedence?: string[] }>>;
};
export type RunRequest = {
  readonly operation: string;
  readonly command: readonly string[];
  readonly acceptedStatuses: readonly number[];
  readonly input?: string;
};

export function withPythonFixContext<Result>(
  {
    projectRoot,
    config,
    headPolicy,
    executeFixCommand,
  }: {
    projectRoot: string;
    config: NitpickerConfig;
    headPolicy: FixPolicy;
    executeFixCommand: ExecuteFixCommand;
  },
  use: (context: ToolContext) => Result,
): Result {
  const reportRoot = trackTemporaryPath(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-fix-')));
  try {
    return use(
      createToolContext({
        projectRoot,
        liveRoot: projectRoot,
        settings: config.python ?? {},
        reportRoot,
        exclude: headPolicy.exclude ?? [],
        conventions: headPolicy.conventions ?? {},
        policyRoot: projectRoot,
        toolPrecedence: toolPrecedenceOf(headPolicy.tools),
        spawn: fixSpawn({ operation: 'python-probe', executeFixCommand }),
      }),
    );
  } finally {
    rmSync(reportRoot, { recursive: true, force: true });
    untrackTemporaryPath(reportRoot);
  }
}

export function commandRunner(
  context: ToolContext,
  executeFixCommand: ExecuteFixCommand,
): (request: RunRequest) => SpawnResult {
  return function run({ operation, command, acceptedStatuses, input }: RunRequest): SpawnResult {
    const [tool = '', ...args] = command;
    const launch = context.launcher.launch(tool, args);
    return runFixCommand({
      operation,
      command: launch.command,
      args: launch.args,
      cwd: context.projectRoot,
      acceptedStatuses,
      environment: { ...launch.env, ...context.env },
      input,
      executeFixCommand,
      describe: (result: SpawnResult) => failure({ context, command, result }).message,
    });
  };
}
