export function leadingSpaces(line) {
  return line.length - line.trimStart().length;
}

export function indentOf(line) {
  return line.trim().length === 0 ? Infinity : leadingSpaces(line);
}

export function majorityStep(steps) {
  const two = steps.filter((step) => step === 2).length;
  const four = steps.filter((step) => step === 4).length;
  if (two === four) {
    return undefined;
  }
  return two > four ? '2' : '4';
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
