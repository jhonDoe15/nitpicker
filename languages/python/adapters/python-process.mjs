import { spawnSync } from 'node:child_process';

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const TOOL_TIMEOUT_MS = 25 * 60 * 1000;
const TOOL_TIMEOUT_MINUTES = TOOL_TIMEOUT_MS / 60000;
const MESSAGE_TAIL_LENGTH = 3000;

export function execute(context, command, { env = {} } = {}) {
  const [tool, ...args] = command;
  const launch = context.launcher.launch(tool, args);
  return spawnSync(launch.command, launch.args, {
    cwd: context.projectRoot,
    env: { ...process.env, ...launch.env, ...context.env, ...env },
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout: TOOL_TIMEOUT_MS,
  });
}

export function run(context, command, { accepted = [0], rule, env, notFoundHint = '' }) {
  const result = execute(context, command, { env });
  if (result.error !== undefined || !accepted.includes(result.status)) {
    throw failure({ context, command, result, rule, notFoundHint });
  }
  return result;
}

export function failure({ context, command, result, rule, notFoundHint = '' }) {
  return Object.assign(new Error(describeFailure({ context, command, result, notFoundHint })), {
    rule,
  });
}

function describeFailure({ context, command, result, notFoundHint }) {
  const [tool, subcommand = '-'] = command;
  const label = subcommand.startsWith('-') ? tool : `${tool} ${subcommand}`;
  const where = `the ${context.launcher.description} environment`;
  if (result.error?.code === 'ENOENT') {
    return `${tool} was not found in ${where}: install it there (for example as a dev dependency), or set "python.environment" to the environment that has it${notFoundHint}`;
  }
  if (result.error?.code === 'ETIMEDOUT') {
    return `${label} timed out after ${String(TOOL_TIMEOUT_MINUTES)} minutes in ${where}`;
  }
  if (result.error !== undefined) {
    return `${label} could not run in ${where}: ${result.error.message}`;
  }
  const output = `${result.stdout}\n${result.stderr}`.trim() || 'no diagnostic output';
  const tail =
    output.length > MESSAGE_TAIL_LENGTH ? `...${output.slice(-MESSAGE_TAIL_LENGTH)}` : output;
  return `${label} exited ${String(result.status)} in ${where}:\n${tail}`;
}
