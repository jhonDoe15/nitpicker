import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { applyFixes } from '../engine/edits/apply-edits.mjs';
import { sourceOf } from '../engine/edits/check-fixes.mjs';
import { checkRealPath } from '../engine/edits/real-paths.mjs';
import { indexListing } from '../engine/edits/untrack.mjs';

export const MODE_MASK = 0o7777;

export function createJournal(projectRoot) {
  return { projectRoot, originals: new Map(), indexListings: new Map(), events: [] };
}

function missingTop(projectRoot, file) {
  return [...file.matchAll(/[\\/]/gu)]
    .map((separator) => file.slice(0, separator.index))
    .filter((directory) => directory.startsWith(projectRoot) && directory !== projectRoot)
    .find((directory) => !existsSync(directory));
}

function locate(projectRoot, name) {
  try {
    return { file: checkRealPath(projectRoot, name) };
  } catch (error) {
    return { error };
  }
}

function readOriginal(projectRoot, file) {
  const stats = lstatSync(file, { throwIfNoEntry: false });
  if (stats === undefined) {
    return { createdUnder: missingTop(projectRoot, file) };
  }
  return stats.isFile() ? { bytes: readFileSync(file), mode: stats.mode & MODE_MASK } : undefined;
}

function namesOf(edit) {
  return edit.type === 'move' ? [edit.from, edit.to] : [sourceOf(edit)];
}

function noteOriginal(journal, name) {
  const { projectRoot, originals } = journal;
  const { file, error } = locate(projectRoot, name);
  if (error !== undefined || originals.has(file)) {
    return;
  }
  const original = readOriginal(projectRoot, file);
  if (original !== undefined) {
    originals.set(file, original);
  }
}

function noteIndex(journal, name) {
  if (!journal.indexListings.has(name)) {
    journal.indexListings.set(name, indexListing(journal.projectRoot, name));
  }
}

function noteOriginals(journal, entries) {
  const edits = entries.flatMap(({ fix }) => fix.edits);
  for (const name of edits.flatMap(namesOf)) {
    noteOriginal(journal, name);
  }
  for (const { path: name } of edits.filter(({ type }) => type === 'untrack')) {
    noteIndex(journal, name);
  }
}

function eventOf(entry, tool) {
  const files = [...new Set(entry.fix.edits.flatMap(namesOf))];
  return entry.recipe === undefined
    ? { tool, safety: 'safe', files }
    : { recipe: entry.recipe, safety: entry.safety, finding: entry.fix.finding, files };
}

export function journalWriter(journal) {
  return {
    projectRoot: journal.projectRoot,
    apply(snapshot, entries, tool) {
      noteOriginals(journal, entries);
      const result = applyFixes(journal.projectRoot, snapshot, entries);
      journal.events.push(...result.applied.map((entry) => eventOf(entry, tool)));
      return result;
    },
  };
}
