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
    undo: () => renameSync(backup, file),
    commit: () => rmSync(backup, { force: true }),
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
  return { undo: () => rmSync(file, { force: true }), commit: () => undefined };
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

function applyPath(context, name, edits) {
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

function attempt(context, name, edits) {
  try {
    return { name, record: applyPath(context, name, edits) };
  } catch (error) {
    return { name, error: error.code === 'EEXIST' ? undefined : error };
  }
}

function dropClosure(entries, failed) {
  const dropped = entries.filter(({ edits }) => edits.some((edit) => failed.has(sourceOf(edit))));
  const grown = new Set([...failed, ...dropped.flatMap(({ edits }) => edits.map(sourceOf))]);
  return grown.size === failed.size ? { dropped, failed } : dropClosure(entries, grown);
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

function staleSources(context, prepared) {
  const sources = prepared.flatMap(({ edits }) =>
    edits.filter((edit) => !edit.isNew).map(sourceOf),
  );
  return new Set(
    sources.filter(
      (name) =>
        !holds(checkRealPath(context.projectRoot, name), context.snapshot.entry(name)?.bytes),
    ),
  );
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
  const stale = staleSources(context, prepared);
  const current = prepared.filter(({ edits }) => !edits.some((edit) => stale.has(sourceOf(edit))));
  const outcomes = [...grouped(current)].map(([name, edits]) => attempt(context, name, edits));
  const { dropped, unwritten } = settleOutcomes(outcomes, current, stale);
  const errors = outcomes.filter(({ error }) => error !== undefined);
  return {
    applied: current.filter((item) => !dropped.includes(item)).map(({ entry }) => entry),
    changedMeanwhile: [
      ...stale,
      ...unwritten.filter((name) => !errors.some((e) => e.name === name)),
    ].sort(),
    errors: errors.map(({ name, error }) => `${name}: ${error.message}`),
  };
}
