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
import { errorCode } from '../typed/error-text.mts';
import { messageOf } from '../../../shared/values/readers.mts';
import {
  restoreIndex,
  type FileState,
  type FixedState,
  type Journal,
  type Original,
} from './journal-types.mts';

export const MODE_MASK = 0o7777;
const SUFFIX_BYTES = 6;

export function currentOf(file: string): FileState | undefined {
  const stats = lstatSync(file, { throwIfNoEntry: false });
  return stats === undefined
    ? undefined
    : { bytes: readFileSync(file), mode: stats.mode & MODE_MASK };
}

function sameState(left: FileState | undefined, right: FileState | undefined) {
  return left === undefined || right === undefined
    ? left === right
    : left.bytes.equals(right.bytes) && left.mode === right.mode;
}

export function savedOf(original: Original): FileState | undefined {
  return 'bytes' in original ? original : undefined;
}

function writeAtomically(file: string, { bytes, mode }: FileState) {
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

export function restoreOne(file: string, original: Original): void {
  const wanted = savedOf(original);
  if (wanted === undefined) {
    rmSync(file, { force: true });
  } else if (!sameState(currentOf(file), wanted)) {
    writeAtomically(file, wanted);
  }
}

function holdsFixed(current: FileState | undefined, fixed: FixedState | undefined) {
  if (fixed === undefined) {
    return true;
  }
  return 'gone' in fixed ? current === undefined : sameState(current, fixed);
}

export function restoreUnlessEdited(
  file: string,
  original: Original,
  fixed: FixedState | undefined,
): boolean {
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

function ignoring(codes: readonly string[], action: () => void) {
  try {
    action();
  } catch (error) {
    if (!codes.includes(String(errorCode(error)))) {
      throw error;
    }
  }
}

function removeEmptyDirectories(directory: string) {
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

function restoreFile(journal: Journal, [file, original]: [string, Original], problems: string[]) {
  try {
    if (!restoreUnlessEdited(file, original, journal.fixed.get(file))) {
      problems.push(`${file}: changed while the dry run ran, left as is`);
    }
  } catch (error) {
    problems.push(`${file}: ${messageOf(error)}`);
  }
}

export function restoreJournal(journal: Journal): string[] {
  const problems: string[] = [];
  for (const entry of journal.originals) {
    restoreFile(journal, entry, problems);
  }
  try {
    restoreIndex(journal.projectRoot, [...journal.indexListings.values()]);
  } catch (error) {
    problems.push(`the git index: ${messageOf(error)}`);
  }
  const created = new Set(
    [...journal.originals.values()].map((original) =>
      'createdUnder' in original ? original.createdUnder : undefined,
    ),
  );
  for (const directory of [...created].filter((entry) => entry !== undefined)) {
    removeEmptyDirectories(directory);
  }
  return problems;
}
