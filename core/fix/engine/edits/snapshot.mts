import { isUtf8 } from 'node:buffer';
import { lstatSync, readFileSync } from 'node:fs';
import { containedPath } from '../../tool-steps/paths/contained-path.mts';
import type { Snapshot, SnapshotEntry } from '../../typed/edit-types.mts';

function readEntry(projectRoot: string, name: string): SnapshotEntry | undefined {
  const file = containedPath(projectRoot, name);
  const stats = lstatSync(file, { throwIfNoEntry: false });
  if (stats === undefined || !stats.isFile()) {
    return undefined;
  }
  const bytes = readFileSync(file);
  return isUtf8(bytes) ? { bytes, text: bytes.toString('utf8') } : undefined;
}

export function createSnapshot(projectRoot: string, names: readonly string[]): Snapshot {
  const entries = new Map<string, SnapshotEntry | undefined>();
  function read(name: string): string | undefined {
    if (!entries.has(name)) {
      entries.set(name, readEntry(projectRoot, name));
    }
    return entries.get(name)?.text;
  }
  const files = names.flatMap((name) => {
    const text = read(name);
    return text === undefined ? [] : [{ path: name, text }];
  });
  return {
    files,
    read,
    entry: (name) => entries.get(name),
    isRead: (name) => entries.get(name) !== undefined,
  };
}

export function snapshotOf(bytesByName: ReadonlyMap<string, Buffer | undefined>): Snapshot {
  const entries = new Map(
    [...bytesByName].map(([name, bytes]): [string, SnapshotEntry | undefined] => [
      name,
      bytes === undefined ? undefined : { bytes, text: bytes.toString('utf8') },
    ]),
  );
  return {
    files: [...entries].flatMap(([name, entry]) =>
      entry === undefined ? [] : [{ path: name, text: entry.text }],
    ),
    read: (name) => entries.get(name)?.text,
    entry: (name) => entries.get(name),
    isRead: (name) => entries.has(name),
  };
}
