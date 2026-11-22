import { statSync } from 'node:fs';
import path from 'node:path';
import type { ListingOptions, Repository, SkipDirectory } from './project-files-types.mts';
import { repositoryOf } from './snapshot/listing-snapshot.mts';
import { inheritedRule, posixRelative, walkedPaths } from './tree-walk.mts';

const ROOT_DIRECTORY = '';

function listedPaths(
  { top, tree }: Repository,
  directory: string,
  { skipDirectory, includeLinks }: { skipDirectory: SkipDirectory; includeLinks: boolean },
): string[] {
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

export function projectFilePaths(root: string, options: ListingOptions = {}): string[] {
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

export function projectFilesUnder(root: string, options?: ListingOptions): string[] {
  const directory = path.resolve(root);
  return projectFilePaths(directory, options).map((file) =>
    path.join(directory, ...file.split('/')),
  );
}
