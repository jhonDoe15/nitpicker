export function addTo(map, key, value) {
  const values = map.get(key) ?? new Set();
  values.add(value);
  map.set(key, values);
}

export function folderOf(file) {
  const index = file.lastIndexOf('/');
  return index < 0 ? '.' : file.slice(0, index);
}

export function remembered(compute) {
  const cache = new Map();
  return (key) => {
    if (!cache.has(key)) {
      cache.set(key, compute(key));
    }
    return cache.get(key);
  };
}
