export function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

export function sorted<Item>(
  items: readonly Item[],
  compare: (left: Item, right: Item) => number,
): readonly Item[] {
  return [...items].sort(compare);
}
