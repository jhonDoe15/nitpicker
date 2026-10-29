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

/** The same list with `#2`, `#3` ... on the keys that repeat, so equal keys stay distinct. */
export function uniqueKeys(items) {
  const seen = new Map();
  return items.map((item) => {
    const count = seen.get(item.key) ?? 0;
    seen.set(item.key, count + 1);
    return count === 0 ? item : { ...item, key: `${item.key}#${String(count + 1)}` };
  });
}
