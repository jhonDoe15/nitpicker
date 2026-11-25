const LEADING_DASHES = /^-+/u;
const INLINE_VALUE = /=.*$/u;
const CHARACTERS_PER_ALLOWED_EDIT = 3;

export function editDistance(left: string, right: string): number {
  let previousRow: number[] = [];
  let row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (const [leftIndex, leftCharacter] of Array.from(left).entries()) {
    const next: number[] = [leftIndex + 1];
    for (const [rightIndex, rightCharacter] of Array.from(right).entries()) {
      const transposed =
        leftIndex > 0 &&
        rightIndex > 0 &&
        leftCharacter === right[rightIndex - 1] &&
        left[leftIndex - 1] === rightCharacter;
      next.push(
        Math.min(
          (row[rightIndex + 1] ?? Number.NaN) + 1,
          (next[rightIndex] ?? Number.NaN) + 1,
          (row[rightIndex] ?? Number.NaN) + (leftCharacter === rightCharacter ? 0 : 1),
          transposed ? (previousRow[rightIndex - 1] ?? Number.NaN) + 1 : Number.POSITIVE_INFINITY,
        ),
      );
    }
    previousRow = row;
    row = next;
  }
  return row[right.length] ?? Number.NaN;
}

function comparable(name: string): string {
  return name.replace(LEADING_DASHES, '').replace(INLINE_VALUE, '').toLowerCase();
}

export function closestMatch(input: string, candidates: readonly string[]): string | undefined {
  const wanted = comparable(input);
  const limit = Math.max(1, Math.floor(wanted.length / CHARACTERS_PER_ALLOWED_EDIT));
  let closest: string | undefined;
  let closestDistance = limit + 1;
  for (const candidate of candidates.filter((name: string) => comparable(name)[0] === wanted[0])) {
    const distance = editDistance(wanted, comparable(candidate));
    if (distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
  }
  return closest;
}

export function didYouMean(input: string, candidates: readonly string[], quote = '"'): string {
  const closest = closestMatch(input, candidates);
  return closest === undefined ? '' : `. Did you mean ${quote}${closest}${quote}?`;
}

export function suggestionOrAllowed(
  input: string,
  candidates: readonly string[],
  allowedLabel = 'Allowed keys',
): string {
  const suggestion = didYouMean(input, candidates);
  return suggestion === '' ? `. ${allowedLabel}: ${candidates.join(', ')}` : suggestion;
}
