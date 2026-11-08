import {
  constants,
  copyFileSync,
  linkSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { containedPath } from '../../common/contained-path.mjs';
import { replaceIfUnchanged } from '../../common/rewrite/safe-write.mjs';

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

function sourcesOf(edits) {
  return edits.flatMap((edit) => {
    if (edit.type === 'move') {
      return [edit.from];
    }
    return edit.type === 'write' && edit.isNew ? [] : [edit.path];
  });
}

function composed(text, replacements) {
  return [...replacements]
    .sort((left, right) => right.start - left.start)
    .reduce(
      (result, edit) => result.slice(0, edit.start) + edit.text + result.slice(edit.end),
      text,
    );
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

function writeNew(file, text) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text, { flag: 'wx' });
  return true;
}

function applyPath(projectRoot, snapshot, name, edits) {
  const file = containedPath(projectRoot, name);
  const expected = snapshot.entry(name)?.bytes;
  const [whole] = edits.filter(({ type }) => type !== 'replace');
  if (whole === undefined) {
    return replaceIfUnchanged(file, expected, composed(snapshot.read(name), edits));
  }
  if (whole.type === 'write') {
    return whole.isNew
      ? writeNew(file, whole.text)
      : replaceIfUnchanged(file, expected, whole.text);
  }
  if (!holds(file, expected)) {
    return false;
  }
  if (whole.type === 'move') {
    linkOrCopy(file, containedPath(projectRoot, whole.to));
  }
  rmSync(file);
  return true;
}

function byPath(edits) {
  const grouped = new Map();
  for (const edit of edits) {
    const name = edit.type === 'move' ? edit.from : edit.path;
    grouped.set(name, [...(grouped.get(name) ?? []), edit]);
  }
  return grouped;
}

function markNew(snapshot, edit) {
  return edit.type === 'write' && !snapshot.isRead(edit.path) ? { ...edit, isNew: true } : edit;
}

export function applyFixes(projectRoot, snapshot, entries) {
  const prepared = entries.map((entry) => ({
    entry,
    edits: entry.fix.edits.map((edit) => markNew(snapshot, edit)),
  }));
  const stale = new Set(
    prepared
      .flatMap(({ edits }) => sourcesOf(edits))
      .filter((name) => !holds(containedPath(projectRoot, name), snapshot.entry(name)?.bytes)),
  );
  const current = prepared.filter(({ edits }) => !sourcesOf(edits).some((name) => stale.has(name)));
  const failed = new Set(stale);
  for (const [name, edits] of byPath(current.flatMap((entry) => entry.edits))) {
    try {
      if (!applyPath(projectRoot, snapshot, name, edits)) {
        failed.add(name);
      }
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
      failed.add(name);
    }
  }
  const touches = ({ edits }, names) =>
    edits.some((edit) => names.has(edit.type === 'move' ? edit.from : edit.path));
  return {
    applied: current.filter((prepared) => !touches(prepared, failed)).map(({ entry }) => entry),
    changedMeanwhile: [...failed].sort(),
  };
}
