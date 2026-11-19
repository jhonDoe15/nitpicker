import path from 'node:path';
import { directoryOf } from '../../../git/patches/renames.mts';
import { sharedTail } from '../module-folders.mts';
import { directoryNamePairs } from '../qualified-names.mts';
import { JVM_SOURCE } from '../declared/declared-package.mts';
import { declaredPackageMoves, MIN_MOVED_FILES } from './declared-package-moves.mts';
import type { DeclaredFiles } from '../declared/move-types.mts';

const SOURCE_FILE = /\.(?:java|kt|groovy|scala|py|[cm]?[jt]sx?)$/u;
const AMBIGUOUS = Symbol('ambiguous');

type Renames = ReadonlyMap<string, string>;
type Files = {
  readonly base: readonly string[];
  readonly head: readonly string[];
  readonly renames: Renames;
};
type PackageRequest = {
  readonly baseFiles: readonly string[];
  readonly headFiles: readonly string[];
  readonly renames: Renames;
};

function segmentsOf(directory: string): string[] {
  return directory === '' ? [] : directory.split('/');
}

function endsWith(directory: string, segments: readonly string[]): boolean {
  const parts = segmentsOf(directory);
  return (
    parts.length >= segments.length &&
    segments.every((segment, index) => segment === parts.at(index - segments.length))
  );
}

function groupedByDirectory(baseFiles: readonly string[]): Map<string, string[]> {
  const directories = new Map<string, string[]>();
  for (const file of baseFiles) {
    const directory = directoryOf(file);
    directories.set(directory, [...(directories.get(directory) ?? []), file]);
  }
  return directories;
}

function wholeMoves(
  directories: ReadonlyMap<string, readonly string[]>,
  {
    renames,
    headDirectories,
  }: { readonly renames: Renames; readonly headDirectories: ReadonlySet<string> },
): Map<string, string> {
  const moved = new Map<string, string>();
  for (const [directory, files] of directories) {
    if (files.length < MIN_MOVED_FILES || headDirectories.has(directory)) {
      continue;
    }
    const destinations = new Set(
      files.map((file) => {
        const renamed = renames.get(file);
        return renamed === undefined ? undefined : directoryOf(renamed);
      }),
    );
    const [only] = destinations;
    if (destinations.size === 1 && only !== undefined && only !== directory) {
      moved.set(directory, only);
    }
  }
  return moved;
}

function pairsOf(directory: string, destination: string): [string, string][] {
  return directoryNamePairs(directory, destination).filter(([, target]) => target !== '');
}

function agreedDestination(
  name: string,
  directories: ReadonlyMap<string, unknown>,
  moved: Renames,
): string | undefined {
  const segments = name.split('.');
  const destinations = new Set<string>();
  for (const directory of [...directories.keys()].filter((candidate) =>
    endsWith(candidate, segments),
  )) {
    const pair = pairsOf(directory, moved.get(directory) ?? directory).find(
      ([from]) => from === name,
    );
    if (pair === undefined) {
      return undefined;
    }
    destinations.add(pair[1]);
  }
  return destinations.size === 1 ? [...destinations][0] : undefined;
}

function dottedMoves(
  directories: ReadonlyMap<string, unknown>,
  moved: Renames,
): [string, string | undefined][] {
  const names = new Set(
    [...moved].flatMap(([directory, destination]) =>
      pairsOf(directory, destination).map(([from]) => from),
    ),
  );
  return [...names].map((name) => [name, agreedDestination(name, directories, moved)]);
}

function renamedFolders(renames: Renames): Map<string, string> {
  const folders = new Map<string, string>();
  for (const [oldPath, newPath] of renames) {
    const from = segmentsOf(directoryOf(oldPath));
    const to = segmentsOf(directoryOf(newPath));
    const tail = sharedTail(from, to);
    const oldFolder = from.slice(0, from.length - tail);
    const newFolder = to.slice(0, to.length - tail);
    if (
      oldFolder.length > 0 &&
      oldFolder.length === newFolder.length &&
      oldFolder.slice(0, -1).join('/') === newFolder.slice(0, -1).join('/')
    ) {
      folders.set(oldFolder.join('/'), newFolder.join('/'));
    }
  }
  return folders;
}

function emptied({
  folder,
  destination,
  files,
}: {
  readonly folder: string;
  readonly destination: string;
  readonly files: Files;
}): boolean {
  const under = files.base.filter((file) => file.startsWith(`${folder}/`));
  return (
    under.length >= MIN_MOVED_FILES &&
    !files.head.some((file) => file.startsWith(`${folder}/`)) &&
    under.every((file) => {
      const moved = files.renames.get(file);
      return moved !== undefined && moved.startsWith(`${destination}/`);
    })
  );
}

function folderMoves(
  files: Files,
  directories: ReadonlyMap<string, unknown>,
): [string, string | undefined][] {
  const candidates = renamedFolders(files.renames);
  const whole = new Map(
    [...candidates].filter(([folder, destination]) => emptied({ folder, destination, files })),
  );
  const folders = new Set(
    [...directories.keys()].flatMap((directory) =>
      segmentsOf(directory).map((_, index) =>
        segmentsOf(directory)
          .slice(0, index + 1)
          .join('/'),
      ),
    ),
  );
  return [...whole].map(([folder, destination]) => {
    const name = path.posix.basename(folder);
    const samePlace = [...folders].filter((other) => path.posix.basename(other) === name);
    const allMoved = samePlace.every(
      (other) =>
        whole.has(other) &&
        path.posix.basename(whole.get(other) ?? '') === path.posix.basename(destination),
    );
    return [name, allMoved ? path.posix.basename(destination) : undefined];
  });
}

function isTaken(name: string, directories: ReadonlyMap<string, unknown>): boolean {
  const segments = name.split('.');
  return [...directories.keys()].some((directory) => endsWith(directory, segments));
}

function pathBasedMoves({ baseFiles, headFiles, renames }: PackageRequest): Map<string, string> {
  const sources = baseFiles.filter((file) => SOURCE_FILE.test(file));
  const directories = groupedByDirectory(sources);
  const headDirectories = new Set(
    headFiles.filter((file) => SOURCE_FILE.test(file)).map((file) => directoryOf(file)),
  );
  const moved = wholeMoves(directories, { renames, headDirectories });
  const known = new Map<string, string | typeof AMBIGUOUS>();
  for (const [from, to] of [
    ...dottedMoves(directories, moved),
    ...folderMoves(
      { base: sources, head: headFiles.filter((file) => SOURCE_FILE.test(file)), renames },
      directories,
    ),
  ]) {
    const earlier = known.get(from);
    known.set(from, to === undefined || (earlier !== undefined && earlier !== to) ? AMBIGUOUS : to);
  }
  return new Map(
    [...known].flatMap(([from, to]): [string, string][] =>
      to === AMBIGUOUS || isTaken(to, directories) ? [] : [[from, to]],
    ),
  );
}

function isOtherSource(file: string): boolean {
  return !JVM_SOURCE.test(file);
}

export function movedPackages({
  baseFiles,
  headFiles,
  renames,
  declared,
}: PackageRequest & { readonly declared?: DeclaredFiles | undefined }): Map<string, string> {
  if (declared === undefined) {
    return pathBasedMoves({ baseFiles, headFiles, renames });
  }
  const undeclared = {
    baseFiles: baseFiles.filter(isOtherSource),
    headFiles: headFiles.filter(isOtherSource),
    renames: new Map([...renames].filter(([oldPath]) => isOtherSource(oldPath))),
  };
  return new Map([...pathBasedMoves(undeclared), ...declaredPackageMoves({ renames, declared })]);
}
