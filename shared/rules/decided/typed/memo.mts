export type Memo<Key extends WeakKey, Value> = {
  readonly has: (key: Key) => boolean;
  readonly get: (key: Key) => Value | undefined;
  readonly remember: (key: Key, value: Value) => void;
};

export function memo<Key extends WeakKey, Value>(): Memo<Key, Value> {
  const known = new WeakMap<Key, Value>();
  return {
    has: (key) => known.has(key),
    get: (key) => known.get(key),
    remember: (key, value) => {
      known.set(key, value);
    },
  };
}
