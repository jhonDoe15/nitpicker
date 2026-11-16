import {
  TROUBLESHOOTING_ANCHORS,
  withTroubleshooting,
} from '../../../../shared/messages/troubleshooting.mjs';
import { spawnSyncWithOutputFile } from '../../../../core/tooling/output-file/output-file.mjs';

import type {
  Accepted,
  ExecuteOptions,
  FailureDetails,
  ProcessContext,
  RunOptions,
  SpawnFunction,
  SpawnResult,
} from './typed/process-types.mts';

const troubleshoot: (message: string, anchor: string) => string = withTroubleshooting;
const spawnWithOutputFile: SpawnFunction = spawnSyncWithOutputFile;

function isSpawn(value: unknown): value is SpawnFunction {
  return typeof value === 'function';
}

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const TOOL_TIMEOUT_MS = 25 * 60 * 1000;
const MILLISECONDS_PER_MINUTE = 60000;
const MESSAGE_TAIL_LENGTH = 3000;
export const VERSION_PATTERN = /\d+\.\d\S*/;

function toolTimeoutMs(context: Pick<ProcessContext, 'analyzerDeadlineMs'>): number {
  return context.analyzerDeadlineMs ?? TOOL_TIMEOUT_MS;
}

export function execute(
  context: ProcessContext,
  command: readonly string[],
  { timeout = toolTimeoutMs(context), env = {}, defaultEnv = {}, cwd }: ExecuteOptions = {},
): SpawnResult {
  const [tool = '', ...args] = command;
  const launch = context.launcher.launch(tool, args);
  const spawn = isSpawn(context.spawn) ? context.spawn : spawnWithOutputFile;
  return spawn(launch.command, launch.args, {
    cwd: cwd ?? context.projectRoot,
    env: { ...defaultEnv, ...process.env, ...launch.env, ...context.env, ...env },
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout,
  });
}

export function probe(context: ProcessContext, command: readonly string[]): SpawnResult {
  const [tool = '', ...args] = command;
  const key = JSON.stringify([
    context.launcher.launch(tool, args),
    context.projectRoot,
    context.env,
  ]);
  const cache = context.probes ?? new Map<string, SpawnResult>();
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const result = execute(context, command);
  cache.set(key, result);
  return result;
}

function isAccepted(accepted: Accepted, result: SpawnResult): boolean {
  return typeof accepted === 'function' ? accepted(result) : accepted.includes(result.status);
}

export function run(
  context: ProcessContext,
  command: readonly string[],
  {
    accepted = [0],
    rule,
    timeoutMs = toolTimeoutMs(context),
    notFoundHint = '',
    ...environment
  }: RunOptions,
): SpawnResult {
  const result = execute(context, command, { timeout: timeoutMs, ...environment });
  if (result.error !== undefined || !isAccepted(accepted, result)) {
    throw failure({ context, command, result, rule, timeoutMs, notFoundHint });
  }
  return result;
}

export function failure({
  context,
  command,
  result,
  rule,
  timeoutMs,
  notFoundHint = '',
}: FailureDetails): Error {
  return Object.assign(
    new Error(describeFailure({ context, command, result, timeoutMs, notFoundHint })),
    { rule },
  );
}

function describeFailure({
  context,
  command,
  result,
  timeoutMs = toolTimeoutMs(context),
  notFoundHint = '',
}: FailureDetails): string {
  const [tool = '', subcommand = '-'] = command;
  const label = subcommand.startsWith('-') ? tool : `${tool} ${subcommand}`;
  const where = `the ${context.launcher.description} environment`;
  if (result.error?.code === 'ENOENT') {
    return troubleshoot(
      `${tool} was not found in ${where}: install it there (for example as a dev dependency), or set "python.environment" to the environment that has it${notFoundHint}`,
      TROUBLESHOOTING_ANCHORS.pythonToolMissing,
    );
  }
  if (result.error?.code === 'ETIMEDOUT') {
    return troubleshoot(
      `${label} timed out after ${String(timeoutMs / MILLISECONDS_PER_MINUTE)} minutes in ${where}`,
      TROUBLESHOOTING_ANCHORS.analyzerTimeout,
    );
  }
  if (result.error !== undefined) {
    return `${label} could not run in ${where}: ${String(result.error.message)}`;
  }
  const output = `${result.stdout}\n${result.stderr}`.trim() || 'no diagnostic output';
  const tail =
    output.length > MESSAGE_TAIL_LENGTH ? `...${output.slice(-MESSAGE_TAIL_LENGTH)}` : output;
  return `${label} exited ${String(result.status)} in ${where}:\n${tail}`;
}

export function probeVersion(context: ProcessContext, command: readonly string[]): string {
  const result = probe(context, command);
  if (result.error !== undefined || result.status !== 0) {
    return 'missing';
  }
  return VERSION_PATTERN.exec(result.stdout)?.[0] ?? 'unknown';
}
