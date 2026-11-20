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
import { replaceIfUnchanged } from '../../tool-steps/rewrite/safe-write.mts';
import { checkRealPath } from './real-paths.mts';
import { indexListing, restoreIndex, untrackPath } from './untrack.mts';
import { errorCode } from '../../typed/error-text.mts';
import type { EditRecord, WholeEdit } from '../../typed/edit-types.mts';

const SUFFIX_BYTES = 6;

export function holds(file: string, expected: Buffer | undefined): boolean {
  try {
    return expected !== undefined && readFileSync(file).equals(expected);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function backupOf(file: string): EditRecord {
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

function linkOrCopy(from: string, to: string): void {
  mkdirSync(path.dirname(to), { recursive: true });
  try {
    linkSync(from, to);
  } catch (error) {
    if (errorCode(error) === 'EEXIST') {
      throw error;
    }
    copyFileSync(from, to, constants.COPYFILE_EXCL);
  }
}

export function replaced(
  file: string,
  expected: Buffer | undefined,
  text: string,
): EditRecord | undefined {
  if (expected === undefined || !replaceIfUnchanged(file, expected, text)) {
    return undefined;
  }
  return {
    undo: () => replaceIfUnchanged(file, Buffer.from(text), expected),
    commit: () => undefined,
  };
}

export function created(file: string, text: string): EditRecord {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text, { flag: 'wx' });
  return {
    undo: () => {
      rmSync(file, { force: true });
    },
    commit: () => undefined,
  };
}

export function removed(
  {
    projectRoot,
    file,
    expected,
  }: { projectRoot: string; file: string; expected: Buffer | undefined },
  edit: Extract<WholeEdit, { type: 'delete' | 'move' }>,
): EditRecord | undefined {
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

export function untracked(projectRoot: string, name: string): EditRecord {
  const listing = indexListing(projectRoot, name);
  untrackPath(projectRoot, name);
  return {
    undo: () => {
      restoreIndex(projectRoot, [listing]);
    },
    commit: () => undefined,
  };
}
