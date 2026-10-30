const MAX_CAUSE_DEPTH = 3;

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function firstLine(text) {
  return text.trim().split('\n', 1)[0].trim();
}

function innerErrors(error) {
  if (!(error instanceof Error)) {
    return [];
  }
  const aggregated = error instanceof AggregateError ? error.errors : [];
  return error.cause === undefined ? aggregated : [...aggregated, error.cause];
}

export function firstErrorLine(error) {
  return firstLine(messageOf(error));
}

function causeLines(error, message) {
  const shown = [message];
  const pending = innerErrors(error).map((inner) => ({ inner, depth: 1 }));
  for (const { inner, depth } of pending) {
    const line = firstErrorLine(inner);
    if (line.length > 0 && !shown.some((text) => text.includes(line))) {
      shown.push(line);
    }
    if (depth < MAX_CAUSE_DEPTH) {
      pending.push(...innerErrors(inner).map((next) => ({ inner: next, depth: depth + 1 })));
    }
  }
  return shown.slice(1).map((line) => `  caused by: ${line}`);
}

export function describeError(error) {
  const message = messageOf(error);
  return [message, ...causeLines(error, message)].join('\n');
}
