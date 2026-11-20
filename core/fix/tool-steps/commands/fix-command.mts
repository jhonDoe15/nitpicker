import type { SpawnSyncReturns } from 'node:child_process';
import { withoutAnsi } from '../../../../shared/messages/terminal/terminal-text.mjs';
import {
  TROUBLESHOOTING_ANCHORS,
  withTroubleshooting,
} from '../../../../shared/messages/troubleshooting.mjs';
import { withoutJvmNoise } from '../../../../shared/messages/jvm/jvm-noise.mjs';
import { fieldOf, messageOf, textOf } from '../../../../shared/values/readers.mts';
import type { FixCommandResult, FixSpawn } from '../../typed/command-types.mts';
import type { FixInvocation } from '../../typed/fix-types.mts';

type FailedResult = Partial<Pick<SpawnSyncReturns<string>, 'stderr' | 'status'>> & {
  readonly error?: { readonly message?: string | undefined } | undefined;
};

type CommandInput = {
  readonly operation: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string | undefined;
  readonly acceptedStatuses: readonly number[];
  readonly environment?: NodeJS.ProcessEnv | undefined;
  readonly input?: string | undefined;
  readonly shell?: true | undefined;
  readonly timeout?: number | undefined;
};

const withoutNoise: (text: string) => string = withoutJvmNoise;
const withoutEscapes: (text: string) => string = withoutAnsi;

type ExecuteFixCommand = (invocation: FixInvocation) => unknown;

export function failureText(result: FailedResult): string {
  const detail = withoutNoise(result.stderr ?? '').trim();
  return result.error?.message ?? (detail || `exit ${String(result.status)}`);
}

function invocationOf({
  operation,
  command,
  args,
  cwd,
  acceptedStatuses,
  environment = {},
  input,
  shell,
  timeout,
}: CommandInput): FixInvocation {
  return {
    operation,
    command,
    args,
    cwd,
    acceptedStatuses,
    environment,
    input,
    ...(shell === true ? { shell } : {}),
    ...(timeout === undefined ? {} : { timeout }),
  };
}

function isCommandResult(value: unknown): value is FixCommandResult {
  return typeof value === 'object' && value !== null;
}

export function runFixCommand({
  executeFixCommand,
  describe = failureText,
  ...command
}: CommandInput & {
  readonly executeFixCommand: ExecuteFixCommand;
  readonly describe?: (result: FixCommandResult) => string;
}): FixCommandResult {
  const result = executeFixCommand(invocationOf(command));
  if (!isCommandResult(result)) {
    throw new TypeError(`${command.operation} failed: the command returned no result`);
  }
  const status = fieldOf(result, 'status');
  if (
    fieldOf(result, 'error') ||
    typeof status !== 'number' ||
    !command.acceptedStatuses.includes(status)
  ) {
    throw new Error(`${command.operation} failed: ${describe(result)}`);
  }
  return result;
}

export function fixSpawn({
  operation,
  acceptedStatuses = [0],
  executeFixCommand,
}: {
  readonly operation: string;
  readonly acceptedStatuses?: readonly number[];
  readonly executeFixCommand: ExecuteFixCommand;
}): FixSpawn {
  return (command, args, options = {}) => {
    const result = executeFixCommand(
      invocationOf({
        operation,
        command,
        args,
        cwd: options.cwd,
        acceptedStatuses,
        environment: options.env,
        input: options.input,
        shell: options.shell,
        timeout: options.timeout,
      }),
    );
    if (!isCommandResult(result)) {
      throw new TypeError(`${operation} failed: the command returned no result`);
    }
    return result;
  };
}

export function fixerError(
  tool: string,
  error: unknown,
): { tool: string; snapshot: string; message: string } {
  return {
    tool,
    snapshot: 'fix',
    message: textOf(
      withTroubleshooting(withoutEscapes(messageOf(error)), TROUBLESHOOTING_ANCHORS.fixersFail),
    ),
  };
}
