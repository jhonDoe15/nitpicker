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

function causeLines(error, shownText, depth) {
  if (depth > MAX_CAUSE_DEPTH) {
    return [];
  }
  return innerErrors(error).flatMap((inner) => {
    const line = firstErrorLine(inner);
    const repeated = line.length === 0 || shownText.includes(line);
    const lines = repeated ? [] : [`  caused by: ${line}`];
    return [...lines, ...causeLines(inner, `${shownText}\n${line}`, depth + 1)];
  });
}

export function describeError(error) {
  const message = messageOf(error);
  return [message, ...causeLines(error, message, 1)].join('\n');
}
