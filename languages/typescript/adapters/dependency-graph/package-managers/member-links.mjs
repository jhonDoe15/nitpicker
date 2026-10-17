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

function linkEntries(liveDirectory, snapshotDirectory, roots) {
  for (const entry of readdirSync(liveDirectory, { withFileTypes: true })) {
    const livePath = containedPath(liveDirectory, entry.name);
    const snapshotPath = containedPath(snapshotDirectory, entry.name);
    if (entry.isDirectory() && entry.name.startsWith('@')) {
      mkdirSync(snapshotPath);
      linkEntries(livePath, snapshotPath, roots);
    } else if (existsSync(livePath)) {
      symlinkSync(linkTarget(livePath, roots), snapshotPath);
    }
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
