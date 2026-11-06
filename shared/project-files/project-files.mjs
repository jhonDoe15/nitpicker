import { statSync } from 'node:fs';
import path from 'node:path';
import { ancestorDirectories } from '../filesystem.mjs';
import { cachedTree } from './listing-cache.mjs';
import { loadTree } from './repository-listing.mjs';
import { hasRepositoryMarker, inheritedRule, posixRelative, walkedPaths } from './tree-walk.mjs';

const ROOT_DIRECTORY = '';

function repositoryTop(directory) {
  return ancestorDirectories(directory).find(hasRepositoryMarker);
}

function repositoryOf(directory) {
  const top = repositoryTop(directory);
  const tree = top === undefined ? undefined : cachedTree(top, loadTree);
  return tree === undefined ? undefined : { top, tree };
}

function listedPaths({ top, tree }, directory, { skipDirectory, includeLinks }) {
  const prefix = posixRelative(top, directory);
  const kept = tree.files.filter((file) => includeLinks || !tree.links.has(file));
  const inside =
    prefix === ROOT_DIRECTORY
      ? kept
      : kept
          .filter((file) => file.startsWith(`${prefix}/`))
          .map((file) => file.slice(prefix.length + 1));
  const isSkipped = inheritedRule((relative) =>
    skipDirectory(path.join(directory, ...relative.split('/')), {
      name: path.posix.basename(relative),
      isDirectory: () => true,
    }),
  );
  return inside.filter((file) => !isSkipped(path.posix.dirname(file)));
}

export function projectFilePaths(root, options = {}) {
  const { skipDirectory = () => false, includeIgnored = false, includeLinks = false } = options;
  const directory = path.resolve(root);
  if (statSync(directory, { throwIfNoEntry: false })?.isDirectory() !== true) {
    return [];
  }
  const repository = repositoryOf(directory);
  if (includeIgnored || repository === undefined) {
    return walkedPaths(directory, {
      skipDirectory,
      includeLinks,
      registered: repository?.tree.submodules,
    }).toSorted();
  }
  return listedPaths(repository, directory, { skipDirectory, includeLinks });
}

export function projectFilesUnder(root, options) {
  const directory = path.resolve(root);
  return projectFilePaths(directory, options).map((file) =>
    path.join(directory, ...file.split('/')),
  );
}
