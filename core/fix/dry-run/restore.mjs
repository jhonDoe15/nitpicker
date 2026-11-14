import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { restoreIndex } from '../engine/edits/untrack.mjs';

export const MODE_MASK = 0o7777;
const SUFFIX_BYTES = 6;

export function currentOf(file) {
  const stats = lstatSync(file, { throwIfNoEntry: false });
  return stats === undefined
    ? undefined
    : { bytes: readFileSync(file), mode: stats.mode & MODE_MASK };
}

function sameState(left, right) {
  return left === undefined || right === undefined
    ? left === right
    : left.bytes.equals(right.bytes) && left.mode === right.mode;
}

export function savedOf(original) {
  return original.bytes === undefined ? undefined : original;
}

function writeAtomically(file, { bytes, mode }) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${randomBytes(SUFFIX_BYTES).toString('hex')}.nitpicker-restore`,
  );
  try {
    writeFileSync(temporary, bytes, { flag: 'wx' });
    chmodSync(temporary, mode);
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function restoreOne(file, original) {
  const wanted = savedOf(original);
  if (wanted === undefined) {
    rmSync(file, { force: true });
  } else if (!sameState(currentOf(file), wanted)) {
    writeAtomically(file, wanted);
  }
}

function holdsFixed(current, fixed) {
  if (fixed === undefined) {
    return true;
  }
  return fixed.gone === true ? current === undefined : sameState(current, fixed);
}

export function restoreUnlessEdited(file, original, fixed) {
  const current = currentOf(file);
  if (sameState(current, savedOf(original))) {
    return true;
  }
  if (!holdsFixed(current, fixed)) {
    return false;
  }
  restoreOne(file, original);
  return true;
}

function ignoring(codes, action) {
  try {
    action();
  } catch (error) {
    if (!codes.includes(error.code)) {
      throw error;
    }
  }
}

function removeEmptyDirectories(directory) {
  ignoring(['ENOENT'], () => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        removeEmptyDirectories(path.join(directory, entry.name));
      }
    }
    ignoring(['ENOTEMPTY', 'EEXIST'], () => {
      rmdirSync(directory);
    });
  });
}

function restoreFile(journal, [file, original], problems) {
  try {
    if (!restoreUnlessEdited(file, original, journal.fixed.get(file))) {
      problems.push(`${file}: changed while the dry run ran, left as is`);
    }
  } catch (error) {
    problems.push(`${file}: ${error.message}`);
  }
}

export function restoreJournal(journal) {
  const problems = [];
  for (const entry of journal.originals) {
    restoreFile(journal, entry, problems);
  }
  try {
    restoreIndex(journal.projectRoot, [...journal.indexListings.values()]);
  } catch (error) {
    problems.push(`the git index: ${error.message}`);
  }
  const created = new Set([...journal.originals.values()].map(({ createdUnder }) => createdUnder));
  for (const directory of [...created].filter((entry) => entry !== undefined)) {
    removeEmptyDirectories(directory);
  }
  return problems;
}
