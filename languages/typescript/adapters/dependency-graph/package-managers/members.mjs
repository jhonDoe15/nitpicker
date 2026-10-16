import { existsSync, lstatSync, readdirSync } from 'node:fs';
import path from 'node:path';

const MAX_MEMBER_DEPTH = 4;
const DEPENDENCY_DIRECTORY = 'node_modules';

function childDirectories(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && entry.name !== DEPENDENCY_DIRECTORY && !entry.name.startsWith('.'),
    )
    .map((entry) => path.join(directory, entry.name));
}

function isRealDirectory(candidate) {
  return (
    existsSync(candidate) &&
    lstatSync(candidate).isDirectory() &&
    !lstatSync(candidate).isSymbolicLink()
  );
}

export function memberDependencyDirectories(root) {
  const found = [{ directory: root, depth: 0 }];
  for (const { directory, depth } of found) {
    if (depth < MAX_MEMBER_DEPTH) {
      found.push(
        ...childDirectories(directory).map((child) => ({ directory: child, depth: depth + 1 })),
      );
    }
  }
  return found
    .slice(1)
    .filter(({ directory }) => existsSync(path.join(directory, 'package.json')))
    .map(({ directory }) => path.relative(root, path.join(directory, DEPENDENCY_DIRECTORY)))
    .filter((relative) => isRealDirectory(path.join(root, relative)));
}
