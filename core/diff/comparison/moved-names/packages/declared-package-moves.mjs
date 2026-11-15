export const MIN_MOVED_FILES = 2;

function groupedByPackage(base) {
  const groups = new Map();
  for (const [file, name] of base) {
    if (name !== '') {
      groups.set(name, [...(groups.get(name) ?? []), file]);
    }
  }
  return groups;
}

function destinationOf(files, { renames, declared }) {
  const destinations = new Set(
    files.map((file) => (renames.has(file) ? declared.head.get(renames.get(file)) : undefined)),
  );
  const [only] = destinations;
  return destinations.size === 1 && only !== undefined && only !== '' ? only : undefined;
}

export function declaredPackageMoves({ renames, declared }) {
  const headNames = new Set(declared.head.values());
  const moves = new Map();
  for (const [name, files] of groupedByPackage(declared.base)) {
    const destination = destinationOf(files, { renames, declared });
    if (
      files.length >= MIN_MOVED_FILES &&
      destination !== undefined &&
      destination !== name &&
      !headNames.has(name) &&
      !declared.base.values().some((other) => other === destination)
    ) {
      moves.set(name, destination);
    }
  }
  return moves;
}
