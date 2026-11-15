import { existsSync, mkdirSync, readdirSync, realpathSync, symlinkSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { containedPath } from './contained-path.mts';
import { memberDependencyDirectories } from './members.mts';

const DEPENDENCY_DIRECTORY = 'node_modules';

type LinkRoots = {
  liveRoot: string;
  snapshotRoot: string;
};

type LinkDirectories = {
  liveDirectory: string;
  snapshotDirectory: string;
};

function isWorkspaceSource(liveRoot: string, real: string): boolean {
  const relative = path.relative(liveRoot, real);
  return (
    !relative.startsWith('..') &&
    !path.isAbsolute(relative) &&
    !relative.split(path.sep).includes(DEPENDENCY_DIRECTORY)
  );
}

function linkTarget(livePath: string, roots: LinkRoots): string {
  const real = realpathSync(livePath);
  return isWorkspaceSource(roots.liveRoot, real)
    ? containedPath(roots.snapshotRoot, path.relative(roots.liveRoot, real))
    : real;
}

function linkEntry(
  entry: Dirent,
  directories: LinkDirectories,
  roots: LinkRoots,
): LinkDirectories | undefined {
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

function linkDirectory(directories: LinkDirectories, roots: LinkRoots): LinkDirectories[] {
  const entries = readdirSync(directories.liveDirectory, { withFileTypes: true });
  return entries
    .map((entry) => linkEntry(entry, directories, roots))
    .filter((scope) => scope !== undefined);
}

function linkEntries(liveRoot: string, snapshotRoot: string, roots: LinkRoots): void {
  const pending: LinkDirectories[] = [{ liveDirectory: liveRoot, snapshotDirectory: snapshotRoot }];
  for (const directories of pending) {
    pending.push(...linkDirectory(directories, roots));
  }
}

export function linkMemberDependencies(snapshotRoot: string, liveRoot: string): string[] {
  const linked: string[] = [];
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
