import { applyFixes } from './edits/apply-edits.mjs';
import { snapshotOf } from './edits/snapshot.mjs';

export function writeTexts(projectRoot, planned) {
  const snapshot = snapshotOf(new Map(planned.map(({ name, bytes }) => [name, bytes])));
  const entries = planned.map(({ name, text }) => ({
    name,
    fix: { edits: [{ type: 'write', path: name, text }] },
  }));
  const { applied, changedMeanwhile, errors } = applyFixes(projectRoot, snapshot, entries);
  const stale = new Set(changedMeanwhile);
  return {
    written: applied.map(({ name }) => name),
    changedMeanwhile: planned.map(({ name }) => name).filter((name) => stale.has(name)),
    unwritable: errors,
  };
}
