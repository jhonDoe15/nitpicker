export function groupBy(items, keyOf) {
  const groups = new Map();
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

function stepName(entry, name) {
  if (entry.name === '*' && entry.alias === undefined) {
    return name;
  }
  if (name === '*') {
    return entry.name;
  }
  return (entry.alias ?? entry.name) === name ? entry.name : undefined;
}

export function reexportSteps(reexports, name) {
  return reexports.flatMap(({ to, names }) =>
    names
      .map((entry) => stepName(entry, name))
      .filter((next) => next !== undefined)
      .map((next) => ({ file: to, name: next })),
  );
}
