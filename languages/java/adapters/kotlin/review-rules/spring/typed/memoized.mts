export function memoized<Key, Value>(compute: (key: Key) => Value): (key: Key) => Value {
  const cache = new Map<Key, { value: Value }>();
  return (key) => {
    const known = cache.get(key);
    if (known !== undefined) {
      return known.value;
    }
    const value = compute(key);
    cache.set(key, { value });
    return value;
  };
}

export function once<Value>(compute: () => Value): () => Value {
  const cached = memoized<undefined, Value>(() => compute());
  return () => cached(undefined);
}
