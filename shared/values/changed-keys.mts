export function changedKeys(
  base: Readonly<Record<string, unknown>>,
  head: Readonly<Record<string, unknown>>,
): string[] {
  return [...new Set([...Object.keys(base), ...Object.keys(head)])]
    .toSorted()
    .filter((key) => JSON.stringify(base[key]) !== JSON.stringify(head[key]));
}
