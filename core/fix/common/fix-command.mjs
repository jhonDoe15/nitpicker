import { withoutAnsi } from '../../../shared/messages/terminal/terminal-text.mjs';
import {
  TROUBLESHOOTING_ANCHORS,
  withTroubleshooting,
} from '../../../shared/messages/troubleshooting.mjs';
import { withoutJvmNoise } from '../../../shared/messages/jvm/jvm-noise.mjs';

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
    message: withTroubleshooting(
      withoutAnsi(error instanceof Error ? error.message : String(error)),
      TROUBLESHOOTING_ANCHORS.fixersFail,
    ),
  };
}
