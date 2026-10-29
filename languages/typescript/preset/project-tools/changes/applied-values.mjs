import { isPlainObject } from '../../../../../shared/config.mjs';
import { listOf, shownValue } from '../config-values.mjs';

export function canonical(value) {
  return JSON.stringify(value, (_key, item) =>
    isPlainObject(item)
      ? Object.fromEntries(
          Object.entries(item).toSorted(([left], [right]) => left.localeCompare(right)),
        )
      : item,
  );
}

export function sortedEntries(value) {
  const entries = [...new Map(listOf(value).map((entry) => [canonical(entry), entry])).entries()];
  return entries.toSorted(([left], [right]) => left.localeCompare(right)).map(([, entry]) => entry);
}

export function addsEntries(base, head) {
  const kept = new Set(listOf(base).map(canonical));
  return listOf(head).some((entry) => !kept.has(canonical(entry)));
}

export function keyChanges({ base, head, label, files }, { applied, loosens }) {
  const keys = [...new Set([...Object.keys(base), ...Object.keys(head)])].toSorted();
  return keys.flatMap((key) => {
    const before = applied(key, base[key]);
    const after = applied(key, head[key]);
    if (canonical(before) === canonical(after)) {
      return [];
    }
    const text = `${label} ${key}: ${shownValue(before)} -> ${shownValue(after)}`;
    return [
      loosens(key, before, after)
        ? { loosened: { text, kind: 'tool-config', files } }
        : { changed: text },
    ];
  });
}
