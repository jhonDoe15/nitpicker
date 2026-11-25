import { statSync } from 'node:fs';
import type { StampedEntry } from './typed/module-types.mts';

function fileStamp(file: string): string | undefined {
  const stats = statSync(file, { throwIfNoEntry: false });
  return stats === undefined ? undefined : `${String(stats.mtimeMs)}:${String(stats.size)}`;
}

export type StampedCache<Value> = Map<string, StampedEntry<Value>>;

type StampedMemo<Value> = {
  get(file: string): StampedEntry<Value> | undefined;
  set(file: string, entry: StampedEntry<Value>): unknown;
};

export function readStamped<Value>(
  cache: StampedMemo<Value>,
  file: string,
  read: (file: string) => Value,
): Value | undefined {
  const stamp = fileStamp(file);
  if (stamp === undefined) {
    return undefined;
  }
  const cached = cache.get(file);
  if (cached?.stamp === stamp) {
    return cached.value;
  }
  const value = read(file);
  cache.set(file, { stamp, value });
  return value;
}
