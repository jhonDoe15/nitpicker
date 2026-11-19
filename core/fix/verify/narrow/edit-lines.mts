import type { Journal, JournalEntry } from '../../dry-run/journal-types.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';
import { beforeLines, changedBlocks, lineAt, overlaps, type Block } from './line-map.mts';
import type { LineRange } from './line-map.mts';

type Texts = { readonly current: string; readonly blocks: readonly Block[] };

export type EditLines = (entry: JournalEntry) => readonly LineRange[] | undefined;

function reader(snapshot: unknown): (name: string) => unknown {
  const read = fieldOf(snapshot, 'read');
  return typeof read === 'function' ? (name) => Reflect.apply(read, snapshot, [name]) : () => null;
}

function textsOf(original: string | undefined, current: unknown): Texts | undefined {
  return typeof current !== 'string' || original === undefined
    ? undefined
    : { current, blocks: changedBlocks(original, current) };
}

function rangeOf({ current, blocks }: Texts, start: number, end: number): LineRange {
  const first = beforeLines(blocks, lineAt(current, start));
  const last = beforeLines(blocks, lineAt(current, Math.max(start, end - 1)));
  return [Math.min(first[0], last[0]), Math.max(first[1], last[1])];
}

export function originalEditLines(
  originalText: (name: string) => string | undefined,
  snapshot: unknown,
): EditLines {
  const read = reader(snapshot);
  const known = new Map<string, Texts | undefined>();
  function texts(name: string): Texts | undefined {
    if (!known.has(name)) {
      known.set(name, textsOf(originalText(name), read(name)));
    }
    return known.get(name);
  }
  return ({ fix }) => {
    const ranges: LineRange[] = [];
    for (const edit of fix.edits) {
      const start = fieldOf(edit, 'start');
      const end = fieldOf(edit, 'end');
      const found = edit.type === 'replace' ? texts(edit.path) : undefined;
      if (found === undefined || typeof start !== 'number' || typeof end !== 'number') {
        return undefined;
      }
      ranges.push(rangeOf(found, start, end));
    }
    return ranges;
  };
}

export function isLeftOut(
  journal: Journal,
  { fix }: JournalEntry,
  lines: readonly LineRange[] | undefined,
): boolean {
  const findings = [...(fix.finding === undefined ? [] : [fix.finding]), ...(fix.alsoFixes ?? [])];
  return journal.leftOut.some(
    (left) =>
      findings.some(
        ({ tool, rule, path: name }) =>
          tool === left.tool && rule === left.rule && name === left.path,
      ) && (lines ?? []).some((range) => left.lines.some((other) => overlaps(range, other))),
  );
}
