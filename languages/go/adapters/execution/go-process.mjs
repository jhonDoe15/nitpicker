import { spawnSync } from 'node:child_process';

const MAX_OUTPUT_BYTES = 200 * 1024 * 1024;
const TOOL_TIMEOUT_MS = 25 * 60 * 1000;
const MILLISECONDS_PER_MINUTE = 60000;
const MESSAGE_TAIL_LENGTH = 3000;
export const ANY_STATUS = 'any';
const BUILD_FLAGS = '-buildvcs=false';
const GO_NOT_FOUND =
  'go was not found on the PATH: install Go (https://go.dev/dl/) or put its bin folder on the PATH';

function goFlags(context) {
  return [context.projectGoFlags ?? context.environment.GOFLAGS, BUILD_FLAGS]
    .filter(Boolean)
    .join(' ');
}

export function execute(context, command, { timeout = TOOL_TIMEOUT_MS, env = {}, cwd } = {}) {
  const [program, ...args] = command;
  return (context.spawn ?? spawnSync)(program, args, {
    cwd: cwd ?? context.projectRoot,
    env: { ...context.environment, GOFLAGS: goFlags(context), ...env },
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout,
  });
}

function accepts(accepted, status) {
  return accepted === ANY_STATUS || accepted.includes(status);
}

export function run(
  context,
  command,
  { accepted = [0], rule, timeoutMs = TOOL_TIMEOUT_MS, ...options },
) {
  const result = execute(context, command, { timeout: timeoutMs, ...options });
  if (result.error !== undefined || !accepts(accepted, result.status)) {
    throw failure({ command, result, rule, timeoutMs });
  }
  return result;
}

export function failure({ command, result, rule, timeoutMs = TOOL_TIMEOUT_MS }) {
  return Object.assign(new Error(describeFailure({ command, result, timeoutMs })), { rule });
}

function outputTail(result) {
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim() || 'no diagnostic output';
  return output.length > MESSAGE_TAIL_LENGTH ? `...${output.slice(-MESSAGE_TAIL_LENGTH)}` : output;
}

function describeFailure({ command, result, timeoutMs }) {
  const [program, subcommand = '-'] = command;
  const label = subcommand.startsWith('-') ? program : `${program} ${subcommand}`;
  if (result.error?.code === 'ENOENT') {
    return program === 'go' ? GO_NOT_FOUND : `${program} was not found`;
  }
  if (result.error?.code === 'ETIMEDOUT') {
    return `${label} timed out after ${String(timeoutMs / MILLISECONDS_PER_MINUTE)} minutes`;
  }
  if (result.error !== undefined) {
    return `${label} could not run: ${result.error.message}`;
  }
  return `${label} exited ${String(result.status)}:\n${outputTail(result)}`;
}
