import { applyFixes } from './edits/apply-edits.mts';
import type { FixWriter } from '../typed/fix-types.mts';

export function directWriter(projectRoot: string): FixWriter {
  return {
    projectRoot,
    apply: (snapshot, entries) => applyFixes(projectRoot, snapshot, entries),
  };
}
