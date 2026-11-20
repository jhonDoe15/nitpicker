import { statSync } from 'node:fs';
import path from 'node:path';
import { appendAll } from '../../../../../shared/lists/lists.mts';
import { runTreeProcess } from '../tree-process.mts';

type TreeRun = {
  readonly script: string;
  readonly root: string;
  readonly files: readonly string[];
  readonly subject: string;
};
type SizeOf = (file: string) => number;
type Batches = { readonly closed: string[][]; readonly open: string[]; readonly bytes: number };

const BATCH_SOURCE_BYTES = 8 * 1024 * 1024;

function sizeOnDisk(root: string): SizeOf {
  return (file) => statSync(path.resolve(root, file), { throwIfNoEntry: false })?.size ?? 0;
}

export function sourceBatches(
  files: readonly string[],
  sizeOf: SizeOf,
  limit = BATCH_SOURCE_BYTES,
): string[][] {
  const { closed, open } = files.reduce<Batches>(
    (batches, file) => {
      const size = sizeOf(file);
      return batches.open.length > 0 && batches.bytes + size > limit
        ? { closed: [...batches.closed, batches.open], open: [file], bytes: size }
        : { ...batches, open: [...batches.open, file], bytes: batches.bytes + size };
    },
    { closed: [], open: [], bytes: 0 },
  );
  return open.length > 0 ? [...closed, open] : closed;
}

export function readTreeUnits(
  { script, root, files, subject }: TreeRun,
  run: typeof runTreeProcess = runTreeProcess,
): unknown[] {
  const units: unknown[] = [];
  for (const batch of sourceBatches(files, sizeOnDisk(root))) {
    const found = run({ script, request: { root, files: batch }, subject });
    if (!Array.isArray(found)) {
      throw new TypeError(`Reading ${subject} syntax trees returned no list`);
    }
    appendAll(units, found);
  }
  return units;
}
