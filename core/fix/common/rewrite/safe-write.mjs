import { randomBytes } from 'node:crypto';
import { chmodSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function replaceIfUnchanged(file, expected, text) {
  if (!readFileSync(file).equals(expected)) {
    return false;
  }
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${randomBytes(6).toString('hex')}.nitpicker-fix`,
  );
  try {
    writeFileSync(temporary, text, { flag: 'wx' });
    chmodSync(temporary, statSync(file).mode & 0o7777);
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
  return true;
}
