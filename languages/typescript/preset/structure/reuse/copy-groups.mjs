export function copyGroups(facts, { rule, isExcepted, isComparable, keyOf }) {
  const groups = new Map();
  for (const { path: filePath, packageRoot, definitions } of facts) {
    const comparable = isExcepted(rule, filePath) ? [] : definitions.filter(isComparable);
    for (const definition of comparable) {
      const key = `${packageRoot}\0${keyOf(definition)}`;
      const group = groups.get(key) ?? [];
      group.push({ path: filePath, definition });
      groups.set(key, group);
    }
  }
  return [...groups.values()].filter((copies) => new Set(copies.map(({ path }) => path)).size >= 2);
}
