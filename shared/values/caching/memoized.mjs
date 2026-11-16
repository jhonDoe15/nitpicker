function remembered(cache, key, value) {
  cache.set(key, value);
  return value;
}

export function memoized(compute) {
  const cache = new Map();
  return (key) => (cache.has(key) ? cache.get(key) : remembered(cache, key, compute(key)));
}
