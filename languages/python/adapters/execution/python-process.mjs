import { spawnSync } from 'node:child_process';

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const TOOL_TIMEOUT_MS = 25 * 60 * 1000;
const MILLISECONDS_PER_MINUTE = 60000;
const MESSAGE_TAIL_LENGTH = 3000;
export const VERSION_PATTERN = /\d+(?:\.\d+)+\S*/;

function withAppended(inherited, additions) {
  const appended = Object.entries(additions).map(([name, value]) => [
    name,
    [inherited[name], value].filter(Boolean).join(' '),
  ]);
  return { ...inherited, ...Object.fromEntries(appended) };
}

export function execute(
  context,
  command,
  { timeout = TOOL_TIMEOUT_MS, env = {}, defaultEnv = {}, appendEnv = {} } = {},
) {
  const [tool, ...args] = command;
  const launch = context.launcher.launch(tool, args);
  return spawnSync(launch.command, launch.args, {
    cwd: context.projectRoot,
    env: withAppended(
      { ...defaultEnv, ...process.env, ...launch.env, ...context.env, ...env },
      appendEnv,
    ),
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout,
  });
}

function isAccepted(accepted, result) {
  return typeof accepted === 'function' ? accepted(result) : accepted.includes(result.status);
}

export function run(
  context,
  command,
  { accepted = [0], rule, timeoutMs = TOOL_TIMEOUT_MS, notFoundHint = '', ...environment },
) {
  const result = execute(context, command, { timeout: timeoutMs, ...environment });
  if (result.error !== undefined || !isAccepted(accepted, result)) {
    throw failure({ context, command, result, rule, timeoutMs, notFoundHint });
  }
  return result;
}

export function failure({ context, command, result, rule, timeoutMs, notFoundHint = '' }) {
  return Object.assign(
    new Error(describeFailure({ context, command, result, timeoutMs, notFoundHint })),
    { rule },
  );
}

function describeFailure({ context, command, result, timeoutMs = TOOL_TIMEOUT_MS, notFoundHint }) {
  const [tool, subcommand = '-'] = command;
  const label = subcommand.startsWith('-') ? tool : `${tool} ${subcommand}`;
  const where = `the ${context.launcher.description} environment`;
  if (result.error?.code === 'ENOENT') {
    return `${tool} was not found in ${where}: install it there (for example as a dev dependency), or set "python.environment" to the environment that has it${notFoundHint}`;
  }
  if (result.error?.code === 'ETIMEDOUT') {
    return `${label} timed out after ${String(timeoutMs / MILLISECONDS_PER_MINUTE)} minutes in ${where}`;
  }
  if (result.error !== undefined) {
    return `${label} could not run in ${where}: ${result.error.message}`;
  }
  const output = `${result.stdout}\n${result.stderr}`.trim() || 'no diagnostic output';
  const tail =
    output.length > MESSAGE_TAIL_LENGTH ? `...${output.slice(-MESSAGE_TAIL_LENGTH)}` : output;
  return `${label} exited ${String(result.status)} in ${where}:\n${tail}`;
}

export function probeVersion(context, command) {
  const result = execute(context, command);
  if (result.error !== undefined || result.status !== 0) {
    return 'missing';
  }
  return VERSION_PATTERN.exec(result.stdout)?.[0] ?? 'unknown';
}
