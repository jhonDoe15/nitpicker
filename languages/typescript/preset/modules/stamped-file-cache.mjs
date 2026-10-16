import { statSync } from 'node:fs';

function fileStamp(file) {
  const stats = statSync(file, { throwIfNoEntry: false });
  return stats === undefined ? undefined : `${String(stats.mtimeMs)}:${String(stats.size)}`;
}

export function readStamped(cache, file, read) {
  const stamp = fileStamp(file);
  if (stamp === undefined) return undefined;
  const cached = cache.get(file);
  if (cached?.stamp === stamp) return cached.value;
  const value = read(file);
  cache.set(file, { stamp, value });
  return value;
}
