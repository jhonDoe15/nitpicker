import { randomBytes } from 'node:crypto';
import {
  constants,
  copyFileSync,
  linkSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { replaceIfUnchanged } from '../../common/rewrite/safe-write.mjs';
import { sourceOf } from './check-fixes.mjs';
import { checkRealPath } from './real-paths.mjs';
import { indexListing, restoreIndex, untrackPath } from './untrack.mjs';

const SUFFIX_BYTES = 6;

function holds(file, expected) {
  try {
    return expected !== undefined && readFileSync(file).equals(expected);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function composed(text, replacements) {
  return [...replacements]
    .sort((left, right) => right.start - left.start)
    .reduce(
      (result, edit) => result.slice(0, edit.start) + edit.text + result.slice(edit.end),
      text,
    );
}

function backupOf(file) {
  const backup = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${randomBytes(SUFFIX_BYTES).toString('hex')}.nitpicker-fix`,
  );
  renameSync(file, backup);
  return {
    undo: () => {
      renameSync(backup, file);
    },
    commit: () => {
      rmSync(backup, { force: true });
    },
  };
}

function linkOrCopy(from, to) {
  mkdirSync(path.dirname(to), { recursive: true });
  try {
    linkSync(from, to);
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw error;
    }
    copyFileSync(from, to, constants.COPYFILE_EXCL);
  }
}

function replaced(file, expected, text) {
  if (!replaceIfUnchanged(file, expected, text)) {
    return undefined;
  }
  return {
    undo: () => replaceIfUnchanged(file, Buffer.from(text), expected),
    commit: () => undefined,
  };
}

function created(file, text) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text, { flag: 'wx' });
  return {
    undo: () => {
      rmSync(file, { force: true });
    },
    commit: () => undefined,
  };
}

function removed({ projectRoot, file, expected }, edit) {
  if (!holds(file, expected)) {
    return undefined;
  }
  if (edit.type === 'delete') {
    return backupOf(file);
  }
  const target = checkRealPath(projectRoot, edit.to);
  linkOrCopy(file, target);
  const backup = backupOf(file);
  return {
    undo: () => {
      backup.undo();
      rmSync(target, { force: true });
    },
    commit: backup.commit,
  };
}

function untracked(projectRoot, name) {
  const listing = indexListing(projectRoot, name);
  untrackPath(projectRoot, name);
  return {
    undo: () => {
      restoreIndex(projectRoot, [listing]);
    },
    commit: () => undefined,
  };
}

function applyTextEdits(context, name, edits) {
  if (edits.length === 0) {
    return { undo: () => undefined, commit: () => undefined };
  }
  const file = checkRealPath(context.projectRoot, name);
  const expected = context.snapshot.entry(name)?.bytes;
  const [whole] = edits.filter(({ type }) => type !== 'replace');
  if (whole === undefined) {
    return replaced(file, expected, composed(context.snapshot.read(name), edits));
  }
  if (whole.type === 'write') {
    return whole.isNew ? created(file, whole.text) : replaced(file, expected, whole.text);
  }
  return removed({ projectRoot: context.projectRoot, file, expected }, whole);
}

function applyPath(context, name, edits) {
  const record = applyTextEdits(
    context,
    name,
    edits.filter((edit) => edit.type !== 'untrack'),
  );
  if (record === undefined || !edits.some((edit) => edit.type === 'untrack')) {
    return record;
  }
  try {
    const index = untracked(context.projectRoot, name);
    return {
      undo: () => {
        for (const { undo } of [index, record]) {
          undo();
        }
      },
      commit: record.commit,
    };
  } catch (error) {
    record.undo();
    throw error;
  }
}

function attempt(context, name, edits) {
  try {
    return { name, record: applyPath(context, name, edits) };
  } catch (error) {
    return { name, error: error.code === 'EEXIST' ? undefined : error };
  }
}

function newlyFailed(entries, name, state) {
  const touching = entries.filter(
    (item) => !state.dropped.has(item) && item.edits.some((edit) => sourceOf(edit) === name),
  );
  const names = [...new Set(touching.flatMap(({ edits }) => edits.map(sourceOf)))].filter(
    (source) => !state.failed.has(source),
  );
  for (const item of touching) {
    state.dropped.add(item);
  }
  for (const source of names) {
    state.failed.add(source);
  }
  return names;
}

function dropClosure(entries, initial) {
  const state = { failed: new Set(initial), dropped: new Set() };
  const pending = [...state.failed];
  for (const name of pending) {
    pending.push(...newlyFailed(entries, name, state));
  }
  return { dropped: [...state.dropped], failed: state.failed };
}

function isTextEdit(edit) {
  return edit.type !== 'untrack';
}

function grouped(entries) {
  const byPath = new Map();
  for (const edit of entries.flatMap(({ edits }) => edits)) {
    byPath.set(sourceOf(edit), [...(byPath.get(sourceOf(edit)) ?? []), edit]);
  }
  return byPath;
}

function prepare(snapshot, entries) {
  return entries.map((entry) => ({
    entry,
    edits: entry.fix.edits.map((edit) =>
      edit.type === 'write' && !snapshot.isRead(edit.path) ? { ...edit, isNew: true } : edit,
    ),
  }));
}

function sourceState(context, name) {
  try {
    const file = checkRealPath(context.projectRoot, name);
    return { name, stale: !holds(file, context.snapshot.entry(name)?.bytes) };
  } catch (error) {
    return { name, error };
  }
}

function checkedSources(context, prepared) {
  const sources = new Set(
    prepared.flatMap(({ edits }) =>
      edits.filter((edit) => !edit.isNew && isTextEdit(edit)).map(sourceOf),
    ),
  );
  const states = [...sources].map((name) => sourceState(context, name));
  return {
    stale: new Set(states.filter(({ stale }) => stale === true).map(({ name }) => name)),
    refused: states.filter(({ error }) => error !== undefined),
  };
}

function settleOutcomes(outcomes, prepared, stale) {
  const unwritten = outcomes.filter(({ record }) => record === undefined).map(({ name }) => name);
  const { dropped, failed } = dropClosure(prepared, new Set([...stale, ...unwritten]));
  for (const { name, record } of [...outcomes].reverse()) {
    if (record !== undefined) {
      (failed.has(name) ? record.undo : record.commit)();
    }
  }
  return { dropped, unwritten };
}

export function applyFixes(projectRoot, snapshot, entries) {
  const context = { projectRoot, snapshot };
  const prepared = prepare(snapshot, entries);
  const { stale, refused } = checkedSources(context, prepared);
  const blocked = new Set([...stale, ...refused.map(({ name }) => name)]);
  const current = prepared.filter(
    ({ edits }) => !edits.some((edit) => blocked.has(sourceOf(edit))),
  );
  const outcomes = [...grouped(current)].map(([name, edits]) => attempt(context, name, edits));
  const { dropped, unwritten } = settleOutcomes(outcomes, current, stale);
  const errors = [...refused, ...outcomes.filter(({ error }) => error !== undefined)];
  const failedNames = new Set(errors.map(({ name }) => name));
  const written = current.filter((item) => !dropped.includes(item)).map(({ entry }) => entry);
  return {
    applied: written,
    changedMeanwhile: [...stale, ...unwritten.filter((name) => !failedNames.has(name))].toSorted(
      (left, right) => left.localeCompare(right),
    ),
    errors: errors.map(({ name, error }) => `${name}: ${error.message}`),
  };
}
