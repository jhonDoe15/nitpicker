import { existsSync, mkdirSync, readdirSync, realpathSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { containedPath } from './contained-path.mjs';
import { memberDependencyDirectories } from './members.mjs';

const DEPENDENCY_DIRECTORY = 'node_modules';

function isWorkspaceSource(liveRoot, real) {
  const relative = path.relative(liveRoot, real);
  return (
    !relative.startsWith('..') &&
    !path.isAbsolute(relative) &&
    !relative.split(path.sep).includes(DEPENDENCY_DIRECTORY)
  );
}

function linkTarget(livePath, roots) {
  const real = realpathSync(livePath);
  return isWorkspaceSource(roots.liveRoot, real)
    ? containedPath(roots.snapshotRoot, path.relative(roots.liveRoot, real))
    : real;
}

function linkEntry(entry, directories, roots) {
  const livePath = containedPath(directories.liveDirectory, entry.name);
  const snapshotPath = containedPath(directories.snapshotDirectory, entry.name);
  if (entry.isDirectory() && entry.name.startsWith('@')) {
    mkdirSync(snapshotPath);
    return { liveDirectory: livePath, snapshotDirectory: snapshotPath };
  }
  if (existsSync(livePath)) {
    symlinkSync(linkTarget(livePath, roots), snapshotPath);
  }
  return undefined;
}

function linkDirectory(directories, roots) {
  const entries = readdirSync(directories.liveDirectory, { withFileTypes: true });
  return entries
    .map((entry) => linkEntry(entry, directories, roots))
    .filter((scope) => scope !== undefined);
}

function linkEntries(liveRoot, snapshotRoot, roots) {
  const pending = [{ liveDirectory: liveRoot, snapshotDirectory: snapshotRoot }];
  for (const directories of pending) {
    pending.push(...linkDirectory(directories, roots));
  }
}

export function linkMemberDependencies(snapshotRoot, liveRoot) {
  const linked = [];
  for (const relative of memberDependencyDirectories(liveRoot)) {
    const snapshotDirectory = containedPath(snapshotRoot, relative);
    if (existsSync(path.dirname(snapshotDirectory)) && !existsSync(snapshotDirectory)) {
      mkdirSync(snapshotDirectory);
      linkEntries(containedPath(liveRoot, relative), snapshotDirectory, { snapshotRoot, liveRoot });
      linked.push(snapshotDirectory);
    }
  }
  return linked;
}
