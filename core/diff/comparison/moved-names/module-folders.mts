import { directoryOf } from '../../git/patches/renames.mts';

type FolderInput = {
  readonly baseFiles: readonly string[];
  readonly renames: ReadonlyMap<string, string>;
};

export function sharedTail(from: readonly string[], to: readonly string[]): number {
  const reversedTo = to.toReversed();
  const mismatch = from.toReversed().findIndex((segment, index) => segment !== reversedTo[index]);
  return mismatch === -1 ? from.length : mismatch;
}

function pairsOf([oldPath, newPath]: readonly [string, string]): [string, string][] {
  const from = directoryOf(oldPath).split('/');
  const to = directoryOf(newPath).split('/');
  return Array.from({ length: sharedTail(from, to) + 1 }, (_, dropped): [string, string] => [
    from.slice(0, from.length - dropped).join('/'),
    to.slice(0, to.length - dropped).join('/'),
  ]);
}

function movedWhole(
  [folder, destination]: readonly [string, string],
  { baseFiles, renames }: FolderInput,
): boolean {
  return baseFiles
    .filter((file) => file.startsWith(`${folder}/`))
    .every((file) => renames.get(file) === `${destination}${file.slice(folder.length)}`);
}

export function movedFolders({ baseFiles, renames }: FolderInput): Map<string, string> {
  const candidates = new Map([...renames].flatMap(pairsOf));
  return new Map(
    [...candidates].filter(
      ([folder, destination]) =>
        folder !== '' &&
        destination !== '' &&
        folder !== destination &&
        baseFiles.some((file) => file.startsWith(`${folder}/`)) &&
        movedWhole([folder, destination], { baseFiles, renames }),
    ),
  );
}

export function mapFolder(directory: string, folders: ReadonlyMap<string, string>): string {
  const parts = directory.split('/');
  const lengths = Array.from({ length: parts.length }, (_, index) => parts.length - index);
  const length = lengths.find((candidate) => folders.has(parts.slice(0, candidate).join('/')));
  return length === undefined
    ? directory
    : [folders.get(parts.slice(0, length).join('/')) ?? '', ...parts.slice(length)].join('/');
}
