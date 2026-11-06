import { existsSync } from 'node:fs';
import path from 'node:path';
import { filesUnder } from '../filesystem.mjs';
import { chainOf } from '../traversal.mjs';

const REPOSITORY_MARKER = '.git';
const ROOT_DIRECTORY = '.';

export function hasRepositoryMarker(directory) {
  return existsSync(path.join(directory, REPOSITORY_MARKER));
}

export function inheritedRule(ownRule) {
  const known = new Map([[ROOT_DIRECTORY, false]]);
  return (directory) => {
    const chain = chainOf(directory, (current) =>
      known.has(current) ? undefined : path.posix.dirname(current),
    );
    for (const current of chain.toReversed().slice(1)) {
      known.set(current, known.get(path.posix.dirname(current)) || ownRule(current));
    }
    return known.get(directory);
  };
}

export function posixRelative(from, to) {
  return path.relative(from, to).split(path.sep).join('/');
}

export function walkedPaths(root, { skipDirectory, registered = new Set(), includeLinks }) {
  const files = filesUnder(root, {
    includeLinks,
    skipDirectory: (absolute, entry) =>
      entry.name === REPOSITORY_MARKER ||
      (hasRepositoryMarker(absolute) && !registered.has(absolute)) ||
      skipDirectory(absolute, entry),
  });
  return [...files]
    .filter((file) => path.basename(file) !== REPOSITORY_MARKER)
    .map((file) => posixRelative(root, file));
}
