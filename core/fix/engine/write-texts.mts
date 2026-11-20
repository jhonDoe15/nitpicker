import { snapshotOf } from './edits/snapshot.mts';
import type { FixEntry, PlannedFinding } from '../typed/edit-types.mts';
import type { FixWriter } from '../typed/fix-types.mts';

type PlannedText = {
  readonly name: string;
  readonly bytes: Buffer | undefined;
  readonly text: string;
  readonly findings?: readonly PlannedFinding[];
} & (
  | { readonly recipe: string; readonly safety: string }
  | { readonly recipe?: undefined; readonly safety?: undefined }
);

export function writeTexts(
  writer: FixWriter,
  planned: readonly PlannedText[],
  tool: string | undefined,
): { written: string[]; changedMeanwhile: string[]; unwritable: string[] } {
  const snapshot = snapshotOf(
    new Map(planned.map(({ name, bytes }): [string, Buffer | undefined] => [name, bytes])),
  );
  const entries = planned.map((entry): FixEntry => {
    const { name, text, findings = [] } = entry;
    return {
      name,
      ...(entry.recipe === undefined ? {} : { recipe: entry.recipe, safety: entry.safety }),
      fix: {
        edits: [{ type: 'write', path: name, text }],
        ...(findings.length === 0 ? {} : { finding: findings[0], alsoFixes: findings.slice(1) }),
      },
    };
  });
  const { applied, changedMeanwhile, errors } = writer.apply(snapshot, entries, tool);
  const stale = new Set(changedMeanwhile);
  return {
    written: applied.flatMap(({ name }) => (name === undefined ? [] : [name])),
    changedMeanwhile: planned.map(({ name }) => name).filter((name) => stale.has(name)),
    unwritable: errors,
  };
}
