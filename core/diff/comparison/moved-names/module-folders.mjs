import { directoryOf } from '../../git/patches/renames.mjs';

export function sharedTail(from, to) {
  const reversedTo = to.toReversed();
  const mismatch = from.toReversed().findIndex((segment, index) => segment !== reversedTo[index]);
  return mismatch === -1 ? from.length : mismatch;
}

function pairsOf([oldPath, newPath]) {
  const from = directoryOf(oldPath).split('/');
  const to = directoryOf(newPath).split('/');
  return Array.from({ length: sharedTail(from, to) + 1 }, (_, dropped) => [
    from.slice(0, from.length - dropped).join('/'),
    to.slice(0, to.length - dropped).join('/'),
  ]);
}

function movedWhole([folder, destination], { baseFiles, renames }) {
  return baseFiles
    .filter((file) => file.startsWith(`${folder}/`))
    .every((file) => renames.get(file) === `${destination}${file.slice(folder.length)}`);
}

export function movedFolders({ baseFiles, renames }) {
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

export function mapFolder(directory, folders) {
  const parts = directory.split('/');
  const lengths = Array.from({ length: parts.length }, (_, index) => parts.length - index);
  const length = lengths.find((candidate) => folders.has(parts.slice(0, candidate).join('/')));
  return length === undefined
    ? directory
    : [folders.get(parts.slice(0, length).join('/')), ...parts.slice(length)].join('/');
}
