export function memoized(cache, key, create) {
  if (!cache.has(key)) {
    cache.set(key, create(key));
  }
  return cache.get(key);
}
