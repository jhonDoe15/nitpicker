const LEADING_DASHES = /^-+/u;
const INLINE_VALUE = /=.*$/u;
const CHARACTERS_PER_ALLOWED_EDIT = 3;

function editDistance(left, right) {
  let previousRow = [];
  let row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (const [leftIndex, leftCharacter] of [...left].entries()) {
    const next = [leftIndex + 1];
    for (const [rightIndex, rightCharacter] of [...right].entries()) {
      const transposed =
        leftIndex > 0 &&
        rightIndex > 0 &&
        leftCharacter === right[rightIndex - 1] &&
        left[leftIndex - 1] === rightCharacter;
      next.push(
        Math.min(
          row[rightIndex + 1] + 1,
          next[rightIndex] + 1,
          row[rightIndex] + (leftCharacter === rightCharacter ? 0 : 1),
          transposed ? previousRow[rightIndex - 1] + 1 : Number.POSITIVE_INFINITY,
        ),
      );
    }
    previousRow = row;
    row = next;
  }
  return row[right.length];
}

function comparable(name) {
  return name.replace(LEADING_DASHES, '').replace(INLINE_VALUE, '').toLowerCase();
}

export function closestMatch(input, candidates) {
  const wanted = comparable(input);
  const limit = Math.max(1, Math.floor(wanted.length / CHARACTERS_PER_ALLOWED_EDIT));
  let closest;
  let closestDistance = limit + 1;
  for (const candidate of candidates.filter((name) => comparable(name)[0] === wanted[0])) {
    const distance = editDistance(wanted, comparable(candidate));
    if (distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
    }
  }
  return closest;
}

export function didYouMean(input, candidates, quote = '"') {
  const closest = closestMatch(input, candidates);
  return closest === undefined ? '' : `. Did you mean ${quote}${closest}${quote}?`;
}

export function suggestionOrAllowed(input, candidates, allowedLabel = 'Allowed keys') {
  const suggestion = didYouMean(input, candidates);
  return suggestion === '' ? `. ${allowedLabel}: ${candidates.join(', ')}` : suggestion;
}
