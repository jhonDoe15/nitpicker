const MAPS = [
  { map: 'statementMap', counts: 's', type: () => 'statement', start: (entry) => entry.start },
  { map: 'fnMap', counts: 'f', type: () => 'function', start: (entry) => entry.loc.start },
  { map: 'branchMap', counts: 'b', type: (entry) => entry.type, start: (entry) => entry.loc.start },
];

function byStart(left, right) {
  return left.start.line - right.start.line || left.start.column - right.start.column;
}

function keyedEntries(coverage, kind) {
  const entries = Object.entries(coverage[kind.map])
    .map(([index, entry]) => ({ index, entry, start: kind.start(entry) }))
    .toSorted(byStart);
  const seen = new Map();
  return entries.map(({ index, entry, start }) => {
    const line = `${kind.type(entry)}@${String(start.line)}`;
    const ordinal = seen.get(line) ?? 0;
    seen.set(line, ordinal + 1);
    return { key: `${line}#${String(ordinal)}`, entry, start, count: coverage[kind.counts][index] };
  });
}

function summed(left, right) {
  if (!Array.isArray(left)) {
    return left + right;
  }
  const longer = left.length >= right.length ? left : right;
  return longer.map((_, index) => (left[index] ?? 0) + (right[index] ?? 0));
}

function mergedEntries(known, next, kind) {
  const merged = new Map(keyedEntries(known, kind).map((item) => [item.key, item]));
  for (const item of keyedEntries(next, kind)) {
    const present = merged.get(item.key);
    merged.set(
      item.key,
      present === undefined ? item : { ...present, count: summed(present.count, item.count) },
    );
  }
  const items = [...merged.values()].toSorted(byStart);
  return {
    [kind.map]: Object.fromEntries(items.map(({ entry }, index) => [index, entry])),
    [kind.counts]: Object.fromEntries(items.map(({ count }, index) => [index, count])),
  };
}

export function mergedCoverage(known, next) {
  if (known === undefined) {
    return next;
  }
  return {
    ...known,
    ...Object.fromEntries(MAPS.flatMap((kind) => Object.entries(mergedEntries(known, next, kind)))),
  };
}
