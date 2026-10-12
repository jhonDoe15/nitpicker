import { spawnSync } from 'node:child_process';

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const TOOL_TIMEOUT_MS = 25 * 60 * 1000;
const MESSAGE_TAIL_LENGTH = 3000;

export function execute(context, command, { env = {}, timeout = TOOL_TIMEOUT_MS } = {}) {
  const [tool, ...args] = command;
  const launch = context.launcher.launch(tool, args);
  return spawnSync(launch.command, launch.args, {
    cwd: context.projectRoot,
    env: { ...process.env, ...launch.env, ...context.env, ...env },
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout,
  });
}

function isAccepted(accepted, result) {
  return typeof accepted === 'function' ? accepted(result) : accepted.includes(result.status);
}

export function run(context, command, { accepted = [0], rule, env, timeoutMs }) {
  const result = execute(context, command, { env, timeout: timeoutMs });
  if (result.error !== undefined || !isAccepted(accepted, result)) {
    throw Object.assign(new Error(describeFailure({ context, command, result })), { rule });
  }
  return result;
}

function describeFailure({ context, command, result }) {
  const [tool, subcommand = '-'] = command;
  const label = subcommand.startsWith('-') ? tool : `${tool} ${subcommand}`;
  const where = `the ${context.launcher.description} environment`;
  if (result.error?.code === 'ENOENT') {
    return `${tool} was not found in ${where}: install it there (for example as a dev dependency)`;
  }
  if (result.error !== undefined) {
    return `${label} could not run in ${where}: ${result.error.message}`;
  }
  const output = `${result.stdout}\n${result.stderr}`.trim() || 'no diagnostic output';
  const tail =
    output.length > MESSAGE_TAIL_LENGTH ? `...${output.slice(-MESSAGE_TAIL_LENGTH)}` : output;
  return `${label} exited ${String(result.status)} in ${where}:\n${tail}`;
}
