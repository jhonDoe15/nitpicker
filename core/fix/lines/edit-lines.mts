import { fieldOf } from '../../../shared/values/readers.mts';
import { beforeLines, changedBlocks, lineAt, lineStarts, overlaps } from './line-map.mts';
import type { Block } from './line-map.mts';
import type { LineSpan } from './line-map.mts';

type FindingRef = { readonly tool: string; readonly rule: string; readonly path: string };

type EditedEntry = {
  readonly fix: {
    readonly edits: readonly { readonly type: string }[];
    readonly finding?: FindingRef | undefined;
    readonly alsoFixes?: readonly FindingRef[];
  };
};

export type EditedLines = readonly LineSpan[];

export type LeftOutFix = FindingRef & {
  readonly line: number;
  readonly lines: EditedLines;
  readonly reason: string;
};

type Texts = { readonly starts: readonly number[]; readonly blocks: readonly Block[] };

export type EditLines = (entry: EditedEntry) => readonly LineSpan[] | undefined;

function reader(snapshot: unknown): (name: string) => unknown {
  const read = fieldOf(snapshot, 'read');
  return typeof read === 'function' ? (name) => Reflect.apply(read, snapshot, [name]) : () => null;
}

function textsOf(original: string | undefined, current: unknown): Texts | undefined {
  return typeof current !== 'string' || original === undefined
    ? undefined
    : { starts: lineStarts(current), blocks: changedBlocks(original, current) };
}

function rangeOf({ starts, blocks }: Texts, start: number, end: number): LineSpan {
  const first = beforeLines(blocks, lineAt(starts, start));
  const last = beforeLines(blocks, lineAt(starts, Math.max(start, end - 1)));
  const lowest = Math.min(first[0], last[0]);
  return [lowest, Math.max(lowest, first[1], last[1])];
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
    const ranges: LineSpan[] = [];
    for (const edit of fix.edits) {
      const start = fieldOf(edit, 'start');
      const end = fieldOf(edit, 'end');
      const name = fieldOf(edit, 'path');
      const found = edit.type === 'replace' && typeof name === 'string' ? texts(name) : undefined;
      if (found === undefined || typeof start !== 'number' || typeof end !== 'number') {
        return undefined;
      }
      ranges.push(rangeOf(found, start, end));
    }
    return ranges;
  };
}

export function isLeftOut(
  leftOut: readonly LeftOutFix[],
  { fix }: EditedEntry,
  lines: readonly LineSpan[] | undefined,
): boolean {
  const findings = [...(fix.finding === undefined ? [] : [fix.finding]), ...(fix.alsoFixes ?? [])];
  return leftOut.some(
    (left) =>
      findings.some(
        ({ tool, rule, path: name }) =>
          tool === left.tool && rule === left.rule && name === left.path,
      ) && (lines ?? []).some((range) => left.lines.some((other) => overlaps(range, other))),
  );
}
