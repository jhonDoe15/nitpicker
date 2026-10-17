export function leadingSpaces(line) {
  return line.length - line.trimStart().length;
}

export function indentOf(line) {
  return line.trim().length === 0 ? Infinity : leadingSpaces(line);
}

const NARROW_STEP = 2;
const WIDE_STEP = 4;

export function majorityStep(steps) {
  const narrow = steps.filter((step) => step === NARROW_STEP).length;
  const wide = steps.filter((step) => step === WIDE_STEP).length;
  if (narrow === wide) {
    return undefined;
  }
  return narrow > wide ? String(NARROW_STEP) : String(WIDE_STEP);
}

export function bracketGroups(lines, { opener, closer }) {
  return lines.flatMap((line, index) => {
    if (!opener.test(line)) {
      return [];
    }
    const indent = indentOf(line);
    const end = lines.findIndex((other, at) => at > index && indentOf(other) <= indent);
    const closes = end > index + 1 && indentOf(lines[end]) === indent && closer.test(lines[end]);
    return closes ? [{ opener: line, inner: lines.slice(index + 1, end), closer: lines[end] }] : [];
  });
}

export function groupJoinLengths(lines, { opener, closer, skip }) {
  return bracketGroups(lines, { opener, closer })
    .filter(({ inner }) =>
      inner.every((other) => indentOf(other) === indentOf(inner[0]) && !skip.test(other)),
    )
    .map(
      ({ opener: first, inner, closer: last }) =>
        first.trimEnd().length +
        inner.map((other) => other.trim()).join(' ').length +
        last.trim().length,
    );
}
