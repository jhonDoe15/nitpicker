export function setMap<Key, Value>(pairs: Iterable<readonly [Key, Value]>): Map<Key, Set<Value>> {
  const map = new Map<Key, Set<Value>>();
  for (const [key, value] of pairs) {
    const values = map.get(key) ?? new Set<Value>();
    values.add(value);
    map.set(key, values);
  }
  return map;
}

export function folderOf(file: string): string {
  const index = file.lastIndexOf('/');
  return index < 0 ? '.' : file.slice(0, index);
}

export function remembered<Key, Value>(compute: (key: Key) => Value): (key: Key) => Value {
  const cache = new Map<Key, { readonly value: Value }>();
  return (key) => {
    const known = cache.get(key);
    if (known !== undefined) {
      return known.value;
    }
    const computed = { value: compute(key) };
    cache.set(key, computed);
    return computed.value;
  };
}
