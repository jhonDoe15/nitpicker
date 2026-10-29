export function stampedValue(cache, key, { stampOf, load, isFresh }) {
  const cached = cache.get(key);
  if (cached !== undefined && stampOf(cached.watched).text === cached.stamp) {
    return cached.value;
  }
  const loaded = load(key);
  if (loaded === undefined) {
    cache.delete(key);
    return undefined;
  }
  const { value, watched } = loaded;
  const { text, newest } = stampOf(watched);
  if (isFresh(newest)) {
    cache.set(key, { stamp: text, watched, value });
  } else {
    cache.delete(key);
  }
  return value;
}
