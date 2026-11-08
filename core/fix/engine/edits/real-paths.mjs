import { existsSync, lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { containedPath } from '../../common/contained-path.mjs';

function nearestExisting(full) {
  return existsSync(full) ? full : nearestExisting(path.dirname(full));
}

function isLink(full) {
  try {
    return lstatSync(full, { throwIfNoEntry: false })?.isSymbolicLink() === true;
  } catch (error) {
    if (error.code === 'ENOTDIR') {
      return false;
    }
    throw error;
  }
}

function inside(root, full) {
  return full === root || full.startsWith(root + path.sep);
}

export function checkRealPath(projectRoot, name) {
  const full = containedPath(projectRoot, name);
  if (isLink(full)) {
    throw new Error(`${name} is a symbolic link`);
  }
  const parent = nearestExisting(path.dirname(full));
  if (!lstatSync(realpathSync(parent)).isDirectory()) {
    throw new Error(
      `${name} is inside ${path.relative(projectRoot, parent)}, which is not a folder`,
    );
  }
  if (!inside(realpathSync(projectRoot), realpathSync(parent))) {
    throw new Error(`${name} is outside ${projectRoot} through a symbolic link`);
  }
  return full;
}
