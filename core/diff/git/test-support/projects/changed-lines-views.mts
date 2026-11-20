import type { ChangedFile } from '../../line-types.mts';

export type { ChangedFile } from '../../line-types.mts';
export { parseChangedLines, readChangedLines } from '../../patches/changed-lines.mts';
export { lineMapOf } from '../../unchanged-lines.mts';

export function changedFile(changes: ReadonlyMap<string, ChangedFile>, name: string): ChangedFile {
  const file = changes.get(name);
  if (file === undefined) {
    throw new Error(`${name} has no changed lines`);
  }
  return file;
}
