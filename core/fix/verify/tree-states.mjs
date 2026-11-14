import { rmSync } from 'node:fs';
import { locate } from '../dry-run/journal.mjs';
import { currentOf, restoreOne, restoreUnlessEdited } from '../dry-run/restore.mjs';
import { restoreIndex } from '../engine/edits/untrack.mjs';

function savedStates(journal, names) {
  return names
    .map((name) => ({ name, ...locate(journal.projectRoot, name) }))
    .filter(({ error }) => error === undefined)
    .flatMap(({ name, file }) => {
      const original = journal.originals.get(file);
      return original === undefined ? [] : [{ name, file, original }];
    });
}

export function restoreFiles(journal, names) {
  const edited = new Set();
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

export function withOriginals(journal, names, run) {
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
