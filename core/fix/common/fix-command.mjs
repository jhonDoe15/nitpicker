const JVM_NOISE = /^(?:Picked up|NOTE: Picked up)/u;

export function failureText(result) {
  const detail = (result.stderr ?? '')
    .split(/\r?\n/u)
    .filter((line) => !JVM_NOISE.test(line))
    .join('\n')
    .trim();
  return result.error?.message ?? (detail || `exit ${result.status}`);
}

export function runFixCommand({
  operation,
  command,
  args,
  cwd,
  acceptedStatuses,
  environment = {},
  input,
  shell = false,
  executeFixCommand,
  describe = failureText,
}) {
  const invocation = {
    operation,
    command,
    args,
    cwd,
    acceptedStatuses,
    environment,
    input,
    ...(shell ? { shell } : {}),
  };
  const result = executeFixCommand(invocation);
  if (result.error || !acceptedStatuses.includes(result.status)) {
    throw new Error(`${operation} failed: ${describe(result)}`);
  }
  return result;
}

export function fixerError(tool, error) {
  return {
    tool,
    snapshot: 'fix',
    message: error instanceof Error ? error.message : String(error),
  };
}
