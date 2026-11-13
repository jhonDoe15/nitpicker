type Keyed = { readonly key: string };

export function addedOccurrences<T extends Keyed>(before: readonly T[], after: readonly T[]): T[] {
  const known = new Map<string, number>();
  for (const occurrence of before) {
    known.set(occurrence.key, (known.get(occurrence.key) ?? 0) + 1);
  }
  return after.filter((occurrence) => {
    const remaining = known.get(occurrence.key) ?? 0;
    known.set(occurrence.key, remaining - 1);
    return remaining <= 0;
  });
}

export function changedOccurrences<T extends Keyed>(
  before: readonly T[],
  after: readonly T[],
): { added: T[]; removed: T[] } {
  return { added: addedOccurrences(before, after), removed: addedOccurrences(after, before) };
}

export function uniqueKeys<T extends Keyed>(items: readonly T[]): T[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const count = seen.get(item.key) ?? 0;
    seen.set(item.key, count + 1);
    return count === 0 ? item : { ...item, key: `${item.key}#${String(count + 1)}` };
  });
}
