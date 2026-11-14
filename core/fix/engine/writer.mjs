import { applyFixes } from './edits/apply-edits.mjs';

export function directWriter(projectRoot) {
  return {
    projectRoot,
    apply: (snapshot, entries) => applyFixes(projectRoot, snapshot, entries),
  };
}
