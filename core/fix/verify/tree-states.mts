import { rmSync } from 'node:fs';
import { locate } from '../dry-run/journal.mts';
import { currentOf, restoreOne, restoreUnlessEdited } from '../dry-run/restore.mts';
import { restoreIndex, type Journal, type Original } from '../dry-run/journal-types.mts';

type Saved = { readonly name: string; readonly file: string; readonly original: Original };

function savedStates(journal: Journal, names: readonly string[]): Saved[] {
  return names
    .map((name) => ({ name, ...locate(journal.projectRoot, name) }))
    .flatMap(({ name, file }) => {
      const original = file === undefined ? undefined : journal.originals.get(file);
      return file === undefined || original === undefined ? [] : [{ name, file, original }];
    });
}

export function restoreFiles(journal: Journal, names: readonly string[]): string[] {
  const edited = new Set<string>();
  for (const { name, file, original } of savedStates(journal, names)) {
    if (!restoreUnlessEdited(file, original, journal.fixed.get(file))) {
      edited.add(name);
    }
  }
  const listings = names
    .filter((name) => !edited.has(name))
    .flatMap((name) => journal.indexListings.get(name) ?? []);
  restoreIndex(journal.projectRoot, listings);
  return [...edited];
}

export function withOriginals<Result>(
  journal: Journal,
  names: readonly string[],
  run: () => Result,
): Result {
  const saved = savedStates(journal, names).map((entry) => ({
    ...entry,
    current: currentOf(entry.file),
  }));
  try {
    for (const { file, original } of saved) {
      restoreOne(file, original);
    }
    return run();
  } finally {
    for (const { file, current } of saved) {
      if (current === undefined) {
        rmSync(file, { force: true });
      } else {
        restoreOne(file, current);
      }
    }
  }
}
