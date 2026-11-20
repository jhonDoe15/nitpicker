import type { DeclaredFiles } from '../declared/move-types.mts';

export const MIN_MOVED_FILES = 2;

function groupedByPackage(base: ReadonlyMap<string, string>): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const [file, name] of base) {
    if (name !== '') {
      groups.set(name, [...(groups.get(name) ?? []), file]);
    }
  }
  return groups;
}

type Request = {
  readonly renames: ReadonlyMap<string, string>;
  readonly declared: DeclaredFiles;
};

function destinationOf(
  files: readonly string[],
  { renames, declared }: Request,
): string | undefined {
  const destinations = new Set(
    files.map((file) => {
      const renamed = renames.get(file);
      return renamed === undefined ? undefined : declared.head.get(renamed);
    }),
  );
  const [only] = destinations;
  return destinations.size === 1 && only !== undefined && only !== '' ? only : undefined;
}

export function declaredPackageMoves({ renames, declared }: Request): Map<string, string> {
  const headNames = new Set(declared.head.values());
  const moves = new Map<string, string>();
  for (const [name, files] of groupedByPackage(declared.base)) {
    const destination = destinationOf(files, { renames, declared });
    if (
      files.length >= MIN_MOVED_FILES &&
      destination !== undefined &&
      destination !== name &&
      !headNames.has(name) &&
      ![...declared.base.values()].some((other) => other === destination)
    ) {
      moves.set(name, destination);
    }
  }
  return moves;
}
