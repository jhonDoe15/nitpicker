export function leadingSpaces(line: string): number {
  return line.length - line.trimStart().length;
}

export function indentOf(line: string): number {
  return line.trim().length === 0 ? Infinity : leadingSpaces(line);
}

const NARROW_STEP = 2;
const WIDE_STEP = 4;

export function majorityStep(steps: readonly unknown[]): string | undefined {
  const narrow = steps.filter((step) => step === NARROW_STEP).length;
  const wide = steps.filter((step) => step === WIDE_STEP).length;
  if (narrow === wide) {
    return undefined;
  }
  return narrow > wide ? String(NARROW_STEP) : String(WIDE_STEP);
}

type BracketGroup = { opener: string; inner: string[]; closer: string };

export function bracketGroups(
  lines: readonly string[],
  { opener, closer }: { readonly opener: RegExp; readonly closer: RegExp },
): BracketGroup[] {
  return lines.flatMap((line, index) => {
    if (!opener.test(line)) {
      return [];
    }
    const indent = indentOf(line);
    const end = lines.findIndex((other, at) => at > index && indentOf(other) <= indent);
    const closing = lines[end];
    return closing !== undefined &&
      end > index + 1 &&
      indentOf(closing) === indent &&
      closer.test(closing)
      ? [{ opener: line, inner: lines.slice(index + 1, end), closer: closing }]
      : [];
  });
}

export function groupJoinLengths(
  lines: readonly string[],
  {
    opener,
    closer,
    skip,
  }: { readonly opener: RegExp; readonly closer: RegExp; readonly skip: RegExp },
): number[] {
  return bracketGroups(lines, { opener, closer })
    .filter(({ inner }) =>
      inner.every((other) => indentOf(other) === indentOf(inner[0] ?? '') && !skip.test(other)),
    )
    .map(
      ({ opener: first, inner, closer: last }) =>
        first.trimEnd().length +
        inner.map((other) => other.trim()).join(' ').length +
        last.trim().length,
    );
}

export function lineAt(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}
