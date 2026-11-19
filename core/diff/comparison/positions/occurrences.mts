import { comparisonKey } from '../fingerprint.mts';
import { normalizeGitPath } from '../../git/normalize.mts';
import { lineMapOf } from '../../git/unchanged-lines.mts';
import type { LineMap } from '../../git/line-types.mts';
import type { BaseMoves } from '../moved-names/declared/move-types.mts';
import type { TouchedCode, TouchedEntry, TrackedFinding } from '../model/finding-types.mts';

const NUMBERED = /#\d+$/u;
const COUNTED = /([|:]occurrence:)\d+/u;

type Group = { readonly base: TrackedFinding[]; readonly head: TrackedFinding[] };
type Groups = Map<string, Group>;
type FileLines = { readonly changed: TouchedEntry | undefined; readonly lines: LineMap };
type Occupied = ReadonlyMap<string, ReadonlySet<number | undefined>>;
type BaseLine = { readonly base: TrackedFinding; readonly line: number };

function occurrenceStem(identity: string): string {
  return identity.replace(NUMBERED, '').replace(COUNTED, '$1');
}

function groupFindings(
  groups: Groups,
  findings: readonly TrackedFinding[],
  { side, moves }: { readonly side: 'base' | 'head'; readonly moves?: BaseMoves },
): void {
  for (const finding of findings) {
    const key = comparisonKey({ ...finding, identity: occurrenceStem(finding.identity) }, moves);
    const group: Group = groups.get(key) ?? { base: [], head: [] };
    group[side].push(finding);
    groups.set(key, group);
  }
}

function lineOf(finding: TrackedFinding): number | undefined {
  return finding.location?.line;
}

function positionOf(finding: TrackedFinding): number {
  return lineOf(finding) ?? 0;
}

function anchoredPairs(
  group: Group,
  lines: LineMap,
): { readonly pairs: Map<TrackedFinding, TrackedFinding>; readonly free: Set<TrackedFinding> } {
  const pairs = new Map<TrackedFinding, TrackedFinding>();
  const free = new Set(group.base);
  const byLine = Map.groupBy(group.base, lineOf);
  for (const head of group.head) {
    const baseLine = lines.baseLineOf(positionOf(head));
    const base = (byLine.get(baseLine) ?? []).find((candidate) => free.has(candidate));
    if (base !== undefined) {
      pairs.set(head, base);
      free.delete(base);
    }
  }
  return { pairs, free };
}

const MAX_NEAREST_CANDIDATES = 250_000;

function inLineOrder(
  heads: readonly TrackedFinding[],
  bases: readonly BaseLine[],
): { head: TrackedFinding; base: TrackedFinding }[] {
  const ordered = bases.toSorted((left, right) => left.line - right.line);
  return heads
    .toSorted((left, right) => positionOf(left) - positionOf(right))
    .slice(0, ordered.length)
    .flatMap((head, index) => {
      const base = ordered[index]?.base;
      return base === undefined ? [] : [{ head, base }];
    });
}

function nearestCandidates(
  heads: readonly TrackedFinding[],
  free: ReadonlySet<TrackedFinding>,
  lines: LineMap,
): { head: TrackedFinding; base: TrackedFinding }[] {
  const bases = [...free].map((base) => ({ base, line: lines.headLineOf(positionOf(base)) }));
  if (heads.length * bases.length > MAX_NEAREST_CANDIDATES) {
    return inLineOrder(heads, bases);
  }
  return heads
    .flatMap((head) =>
      bases.map(({ base, line }) => ({ head, base, distance: Math.abs(positionOf(head) - line) })),
    )
    .toSorted((left, right) => left.distance - right.distance);
}

function isLegacyTwinElsewhere(
  head: TrackedFinding,
  base: TrackedFinding,
  lines: LineMap,
): boolean {
  return (
    lines.isOutsideHunks(positionOf(base), 'base') &&
    lines.hasSameText(
      { line: positionOf(head), column: columnOf(head, base) },
      { line: positionOf(base), column: columnOf(base, head) },
    )
  );
}

function columnOf(finding: TrackedFinding, other: TrackedFinding): number | undefined {
  return other.location?.column === undefined ? undefined : finding.location?.column;
}

function isNewOnUnchangedLine(
  head: TrackedFinding,
  {
    file,
    occupied,
    legacy,
  }: {
    readonly file: FileLines;
    readonly occupied: Occupied;
    readonly legacy: readonly TrackedFinding[];
  },
): boolean {
  const line = positionOf(head);
  return (
    file.changed !== undefined &&
    !file.changed.added &&
    file.lines.isOutsideHunks(line) &&
    !occupied.get(fileKey(head.tool, head.path))?.has(file.lines.baseLineOf(line)) &&
    legacy.some((base) => isLegacyTwinElsewhere(head, base, file.lines))
  );
}

function pairByPosition(
  group: Group,
  {
    file,
    moves,
    occupied,
  }: { readonly file: FileLines; readonly moves: BaseMoves; readonly occupied: Occupied },
): [TrackedFinding, string][] {
  const { pairs, free } = anchoredPairs(group, file.lines);
  const legacy = [...free];
  const heads = group.head.filter(
    (head) => !(pairs.has(head) || isNewOnUnchangedLine(head, { file, occupied, legacy })),
  );
  for (const { head, base } of nearestCandidates(heads, free, file.lines)) {
    if (!pairs.has(head) && free.has(base)) {
      pairs.set(head, base);
      free.delete(base);
    }
  }
  return group.head.map((head): [TrackedFinding, string] => {
    const paired = pairs.get(head);
    return [
      head,
      paired === undefined
        ? comparisonKey({ ...head, identity: `${head.identity}\0unpaired` })
        : comparisonKey(paired, moves),
    ];
  });
}

function isPositioned(group: Group): boolean {
  return [...group.base, ...group.head].every((finding) => lineOf(finding) !== undefined);
}

function fileKey(tool: string, path: string): string {
  return JSON.stringify([tool, normalizeGitPath(path)]);
}

function occupiedBaseLines(
  baseFindings: readonly TrackedFinding[],
  moves: BaseMoves,
): Map<string, Set<number | undefined>> {
  const occupied = new Map<string, Set<number | undefined>>();
  for (const finding of baseFindings.filter((candidate) => lineOf(candidate) !== undefined)) {
    const path = normalizeGitPath(finding.path);
    const key = fileKey(finding.tool, moves.files.get(path) ?? path);
    occupied.set(key, (occupied.get(key) ?? new Set<number | undefined>()).add(lineOf(finding)));
  }
  return occupied;
}

export function pairedKeys({
  baseFindings,
  headFindings,
  moves,
  touchedCode,
}: {
  readonly baseFindings: readonly TrackedFinding[];
  readonly headFindings: readonly TrackedFinding[];
  readonly moves: BaseMoves;
  readonly touchedCode: Pick<TouchedCode, 'changedLines'> | undefined;
}): Map<TrackedFinding, string> {
  const groups: Groups = new Map();
  groupFindings(groups, baseFindings, { side: 'base', moves });
  groupFindings(groups, headFindings, { side: 'head' });
  const paired = [...groups.values()].filter(
    (group) => group.head.length > 0 && group.base.length > 0 && isPositioned(group),
  );
  const files = new Map(
    [...new Set(paired.flatMap((group) => group.head[0]?.path ?? []))].map(
      (path): [string, FileLines] => {
        const changed = touchedCode?.changedLines.get(path);
        return [path, { changed, lines: lineMapOf(changed) }];
      },
    ),
  );
  const occupied = occupiedBaseLines(baseFindings, moves);
  return new Map(
    paired.flatMap((group) => {
      const file = files.get(group.head[0]?.path ?? '');
      return file === undefined ? [] : pairByPosition(group, { file, moves, occupied });
    }),
  );
}
