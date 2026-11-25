import type { Copy, CopyModule, CopyOptions } from './typed/reuse-types.mts';

export function copyGroups(
  facts: readonly CopyModule[],
  { rule, isExcepted, isComparable, keyOf }: CopyOptions,
): Copy[][] {
  const groups = new Map<string, Copy[]>();
  for (const { path: filePath, packageRoot, definitions } of facts) {
    const comparable = isExcepted(rule, filePath) ? [] : definitions.filter(isComparable);
    for (const definition of comparable) {
      const key = JSON.stringify([packageRoot, keyOf(definition)]);
      const group = groups.get(key) ?? [];
      group.push({ path: filePath, definition });
      groups.set(key, group);
    }
  }
  return [...groups.values()].filter((copies) => new Set(copies.map(({ path }) => path)).size >= 2);
}
