import type { ImportName } from './typed/fact-types.mts';

export function groupBy<Item, Key>(
  items: readonly Item[],
  keyOf: (item: Item) => Key,
): Map<Key, Item[]> {
  const groups = new Map<Key, Item[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [item]);
    } else {
      group.push(item);
    }
  }
  return groups;
}

function stepName(entry: ImportName, name: string): string | undefined {
  if (entry.name === '*' && entry.alias === undefined) {
    return name;
  }
  if (name === '*') {
    return entry.name;
  }
  return (entry.alias ?? entry.name) === name ? entry.name : undefined;
}

export type ReexportStep = { readonly file: string; readonly name: string };

export function reexportSteps(
  reexports: readonly { readonly to: string; readonly names: readonly ImportName[] }[],
  name: string,
): ReexportStep[] {
  return reexports.flatMap(({ to, names }) =>
    names
      .map((entry) => stepName(entry, name))
      .filter((next) => next !== undefined)
      .map((next) => ({ file: to, name: next })),
  );
}
