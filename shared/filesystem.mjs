import { readdirSync } from 'node:fs';
import path from 'node:path';
import { depthFirst } from './traversal.mjs';

export function* filesUnder(root, { skipDirectory = () => false } = {}) {
  function children(frame) {
    if (frame.entry && (!frame.entry.isDirectory() || skipDirectory(frame.absolute, frame.entry)))
      return [];
    return readdirSync(frame.absolute, { withFileTypes: true }).map((entry) => ({
      absolute: path.join(frame.absolute, entry.name),
      entry,
    }));
  }
  for (const frame of depthFirst({ absolute: root }, children)) {
    if (frame.entry?.isFile()) yield frame.absolute;
  }
}
