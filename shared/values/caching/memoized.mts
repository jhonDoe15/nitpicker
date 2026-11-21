type Entry<Value> = { readonly value: Value };

function remembered<Key, Value>(
  cache: Map<Key, Entry<Value>>,
  key: Key,
  value: Value,
): Entry<Value> {
  const entry = { value };
  cache.set(key, entry);
  return entry;
}

export function memoized<Key, Value>(compute: (key: Key) => Value): (key: Key) => Value {
  const cache = new Map<Key, Entry<Value>>();
  return (key: Key) => (cache.get(key) ?? remembered(cache, key, compute(key))).value;
}
