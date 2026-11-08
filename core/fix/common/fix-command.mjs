import { withoutJvmNoise } from '../../../shared/messages/jvm-noise.mjs';

export function failureText(result) {
  const detail = withoutJvmNoise(result.stderr ?? '').trim();
  return result.error?.message ?? (detail || `exit ${result.status}`);
}

function invocationOf({
  operation,
  command,
  args,
  cwd,
  acceptedStatuses,
  environment = {},
  input,
  shell = false,
  timeout,
}) {
  return {
    operation,
    command,
    args,
    cwd,
    acceptedStatuses,
    environment,
    input,
    ...(shell ? { shell } : {}),
    ...(timeout === undefined ? {} : { timeout }),
  };
}

export function runFixCommand({ executeFixCommand, describe = failureText, ...command }) {
  const result = executeFixCommand(invocationOf(command));
  if (result.error || !command.acceptedStatuses.includes(result.status)) {
    throw new Error(`${command.operation} failed: ${describe(result)}`);
  }
  return result;
}

export function fixSpawn({ operation, acceptedStatuses = [0], executeFixCommand }) {
  return (command, args, options = {}) =>
    executeFixCommand(
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
}

export function fixerError(tool, error) {
  return {
    tool,
    snapshot: 'fix',
    message: error instanceof Error ? error.message : String(error),
  };
}
