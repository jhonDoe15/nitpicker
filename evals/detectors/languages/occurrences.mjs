/**
 * The occurrences of `after` that `before` does not account for. An occurrence is
 * `{ key, ...rest }`; the keys are counted, not their lines, so code that merely moved or was
 * edited around an existing occurrence is not new, and a second copy of one is.
 */
export function addedOccurrences(before, after) {
  const known = new Map();
  for (const occurrence of before) {
    known.set(occurrence.key, (known.get(occurrence.key) ?? 0) + 1);
  }
  return after.filter((occurrence) => {
    const remaining = known.get(occurrence.key) ?? 0;
    known.set(occurrence.key, remaining - 1);
    return remaining <= 0;
  });
}

/** Both directions of `addedOccurrences`: `{ added, removed }` for two lists of occurrences. */
export function changedOccurrences(before, after) {
  return { added: addedOccurrences(before, after), removed: addedOccurrences(after, before) };
}

/** Index of the bracket that closes the one at `open`, or -1; `text` should be masked. */
export function closingBracket(text, open) {
  const pair = { '(': ')', '{': '}', '[': ']' }[text[open]];
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    depth += Number(text[index] === text[open]) - Number(text[index] === pair);
    if (depth === 0) return index;
  }
  return -1;
}

/** The 1-based line of `index` in `text`. */
export const lineOfIndex = (text, index) => text.slice(0, index).split('\n').length;
