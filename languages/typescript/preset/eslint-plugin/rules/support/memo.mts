type Memo<Key, Value> = {
  get(key: Key): Value | undefined;
  set(key: Key, value: Value): unknown;
};

export function memoized<Key, Value>(
  cache: Memo<Key, Value>,
  key: Key,
  create: (key: Key) => Value,
): Value {
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const created = create(key);
  cache.set(key, created);
  return created;
}
