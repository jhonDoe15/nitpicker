import { existsSync, lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { ancestorDirectories, pathInside } from '../../../shared/filesystem.mjs';

export function insideProject(root, relative) {
  const file = pathInside(root, relative);
  if (file === undefined) {
    throw new Error(`${relative} is outside ${root}`);
  }
  return file;
}

export function hasProjectFile(root, ...names) {
  return names.some((name) => existsSync(insideProject(root, name)));
}

function resolvedTarget(file) {
  const present = [file, ...ancestorDirectories(path.dirname(file))].find(
    (candidate) => lstatSync(candidate, { throwIfNoEntry: false }) !== undefined,
  );
  if (!existsSync(present)) {
    return undefined;
  }
  return path.join(realpathSync(present), path.relative(present, file));
}

function linkProblem(root, target) {
  if (target === undefined) {
    return 'is a symbolic link to a missing file';
  }
  const realRoot = realpathSync(root);
  return pathInside(realRoot, path.relative(realRoot, target)) === undefined
    ? `resolves through a symbolic link to ${target}, outside ${root}`
    : undefined;
}

export function writableProjectFile(root, relative) {
  const file = insideProject(root, relative);
  const problem = linkProblem(root, resolvedTarget(file));
  if (problem !== undefined) {
    throw new Error(
      `${relative} ${problem}, so nitpicker init does not write through it. Replace the link with a file, or make the change by hand.`,
    );
  }
  return file;
}
