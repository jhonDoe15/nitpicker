import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { depthFirst } from './traversal.mjs';

export function pathInside(root, relative) {
  const full = path.resolve(root, relative);
  const fromRoot = path.relative(path.resolve(root), full);
  if (fromRoot === '..' || fromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(fromRoot)) {
    return undefined;
  }
  return full;
}

export function isStrictlyInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function firstFileIn(root, names) {
  return names.map((name) => path.join(root, name)).find((file) => existsSync(file));
}

export function ancestorDirectories(directory) {
  const found = [directory];
  for (const current of found) {
    const parent = path.dirname(current);
    if (parent !== current) {
      found.push(parent);
    }
  }
  return found;
}

function skipNoDirectory(_absolute, _entry) {
  return false;
}

export function* filesUnder(root, { skipDirectory = skipNoDirectory, includeLinks = false } = {}) {
  function children(frame) {
    if (frame.entry && (!frame.entry.isDirectory() || skipDirectory(frame.absolute, frame.entry)))
      return [];
    return readdirSync(frame.absolute, { withFileTypes: true }).map((entry) => ({
      absolute: path.join(frame.absolute, entry.name),
      entry,
    }));
  }
  for (const frame of depthFirst({ absolute: root }, children)) {
    if (frame.entry?.isFile() || (includeLinks && frame.entry?.isSymbolicLink())) {
      yield frame.absolute;
    }
  }
}
