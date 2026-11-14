import { isUtf8 } from 'node:buffer';
import { lstatSync, readFileSync } from 'node:fs';
import { containedPath } from '../../common/contained-path.mjs';

function readEntry(projectRoot, name) {
  const file = containedPath(projectRoot, name);
  const stats = lstatSync(file, { throwIfNoEntry: false });
  if (stats === undefined || !stats.isFile()) {
    return undefined;
  }
  const bytes = readFileSync(file);
  return isUtf8(bytes) ? { bytes, text: bytes.toString('utf8') } : undefined;
}

export function createSnapshot(projectRoot, names) {
  const entries = new Map();
  function read(name) {
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

export function snapshotOf(bytesByName) {
  const entries = new Map(
    [...bytesByName].map(([name, bytes]) => [name, { bytes, text: bytes.toString('utf8') }]),
  );
  return {
    files: [...entries].map(([name, { text }]) => ({ path: name, text })),
    read: (name) => entries.get(name)?.text,
    entry: (name) => entries.get(name),
    isRead: (name) => entries.has(name),
  };
}
