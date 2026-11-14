import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { MODE_MASK, currentOf } from './restore.mts';
import {
  applyFixes,
  checkRealPath,
  indexListing,
  sourceOf,
  type Journal,
  type JournalEdit,
  type JournalEntry,
  type JournalEvent,
  type JournalWriter,
  type Located,
  type Original,
} from './journal-types.mts';

export function createJournal(projectRoot: string): Journal {
  return {
    projectRoot,
    originals: new Map(),
    fixed: new Map(),
    indexListings: new Map(),
    events: [],
    savers: [],
  };
}

function missingTop(projectRoot: string, file: string) {
  return [...file.matchAll(/[\\/]/gu)]
    .map((separator) => file.slice(0, separator.index))
    .filter((directory) => directory.startsWith(projectRoot) && directory !== projectRoot)
    .find((directory) => !existsSync(directory));
}

export function locate(projectRoot: string, name: string): Located {
  try {
    return { file: checkRealPath(projectRoot, name), error: undefined };
  } catch (error) {
    return { file: undefined, error };
  }
}

function readOriginal(projectRoot: string, file: string): Original | undefined {
  const stats = lstatSync(file, { throwIfNoEntry: false });
  if (stats === undefined) {
    return { createdUnder: missingTop(projectRoot, file) };
  }
  return stats.isFile() ? { bytes: readFileSync(file), mode: stats.mode & MODE_MASK } : undefined;
}

function namesOf(edit: JournalEdit) {
  return edit.type === 'move' ? [edit.from, edit.to] : [sourceOf(edit)];
}

function noteOriginal(journal: Journal, name: string) {
  const { projectRoot, originals } = journal;
  const { file } = locate(projectRoot, name);
  if (file === undefined || originals.has(file)) {
    return;
  }
  const original = readOriginal(projectRoot, file);
  if (original !== undefined) {
    originals.set(file, original);
  }
}

function noteIndex(journal: Journal, name: string) {
  if (!journal.indexListings.has(name)) {
    journal.indexListings.set(name, indexListing(journal.projectRoot, name));
  }
}

function noteOriginals(journal: Journal, entries: readonly JournalEntry[]) {
  const edits = entries.flatMap(({ fix }) => fix.edits);
  for (const name of edits.flatMap(namesOf)) {
    noteOriginal(journal, name);
  }
  for (const edit of edits) {
    if (edit.type === 'untrack') {
      noteIndex(journal, edit.path);
    }
  }
}

function noteFixed(journal: Journal, entries: readonly JournalEntry[]) {
  const names = entries.flatMap(({ fix }) => fix.edits.flatMap(namesOf));
  for (const name of new Set(names)) {
    const { file } = locate(journal.projectRoot, name);
    if (file !== undefined && journal.originals.has(file)) {
      journal.fixed.set(file, currentOf(file) ?? { gone: true });
    }
  }
}

function eventOf(entry: JournalEntry, tool: string | undefined): JournalEvent {
  const files = [...new Set(entry.fix.edits.flatMap(namesOf))];
  return entry.recipe === undefined
    ? { tool, safety: 'safe', files }
    : { recipe: entry.recipe, safety: entry.safety, finding: entry.fix.finding, files };
}

function saveAll(journal: Journal) {
  for (const save of journal.savers) {
    save();
  }
}

export function journalWriter(journal: Journal): JournalWriter {
  return {
    projectRoot: journal.projectRoot,
    apply(snapshot, entries, tool) {
      noteOriginals(journal, entries);
      saveAll(journal);
      const result = applyFixes(journal.projectRoot, snapshot, entries);
      noteFixed(journal, entries);
      saveAll(journal);
      const { events } = journal;
      events.push(...result.applied.map((entry) => eventOf(entry, tool)));
      return result;
    },
  };
}
