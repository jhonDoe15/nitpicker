import { existsSync, lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { containedPath } from '../../tool-steps/paths/contained-path.mts';
import { errorCode } from '../../typed/error-text.mts';

function nearestExisting(full: string): string | undefined {
  const parts = full.split(path.sep);
  return parts
    .map((_, index) => parts.slice(0, parts.length - index).join(path.sep) || path.sep)
    .find((candidate) => existsSync(candidate));
}

function isLink(full: string): boolean {
  try {
    return lstatSync(full, { throwIfNoEntry: false })?.isSymbolicLink() === true;
  } catch (error) {
    if (errorCode(error) === 'ENOTDIR') {
      return false;
    }
    throw error;
  }
}

function inside(root: string, full: string): boolean {
  return full === root || full.startsWith(root + path.sep);
}

export function checkRealPath(projectRoot: string, name: string): string {
  const full = containedPath(projectRoot, name);
  if (isLink(full)) {
    throw new Error(`${name} is a symbolic link`);
  }
  const parent = nearestExisting(path.dirname(full)) ?? path.sep;
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
