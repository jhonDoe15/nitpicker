import { randomBytes } from 'node:crypto';
import { chmodSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SUFFIX_BYTES = 6;
const PERMISSION_BITS = 0o7777;

function stillHolds(file, expected) {
  try {
    return readFileSync(file).equals(expected);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

export function replaceIfUnchanged(file, expected, text) {
  if (!stillHolds(file, expected)) {
    return false;
  }
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${randomBytes(SUFFIX_BYTES).toString('hex')}.nitpicker-fix`,
  );
  try {
    writeFileSync(temporary, text, { flag: 'wx' });
    chmodSync(temporary, statSync(file).mode & PERMISSION_BITS);
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
  return true;
}
