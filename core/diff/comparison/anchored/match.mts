import type {
  AnchoredFinding,
  ChangedLines,
  FindingPair,
  TrackedFinding,
} from '../model/finding-types.mts';
import { isAnchored } from '../model/finding-guards.mts';
import { normalizeGitPath } from '../../git/normalize.mts';
import {
  isBelowChange,
  isOnInsertedLine,
  isOnLoneInsertedLine,
  isOnUnchangedLine,
} from '../ratchet/touched-code.mts';
import { addToGroup } from '../../../../shared/lists/lists.mts';

type Renames = ReadonlyMap<string, string>;

function placeOf(finding: TrackedFinding, renames: Renames): [string, string] {
  const normalizedPath = normalizeGitPath(finding.path);
  return [finding.tool, renames.get(normalizedPath) ?? normalizedPath];
}

function anchorKey(finding: AnchoredFinding, renames: Renames): string {
  return JSON.stringify([
    ...placeOf(finding, renames),
    finding.rule,
    finding.classification,
    finding.anchor.key,
  ]);
}

function symbolKey(finding: TrackedFinding, renames: Renames): string {
  return JSON.stringify([...placeOf(finding, renames), finding.symbol]);
}

function symbolsOf(findings: readonly TrackedFinding[], renames: Renames): Set<string> {
  return new Set(
    findings
      .filter((finding) => finding.symbol !== undefined)
      .map((finding) => symbolKey(finding, renames)),
  );
}

function byLine(left: TrackedFinding, right: TrackedFinding): number {
  return (
    (left.location?.line ?? 0) - (right.location?.line ?? 0) ||
    left.identity.localeCompare(right.identity)
  );
}

function canMove(head: TrackedFinding, touchedCode: ChangedLines | undefined): boolean {
  if (
    head.anchor === undefined ||
    (isOnInsertedLine(head, touchedCode) && !isOnLoneInsertedLine(head, touchedCode))
  ) {
    return false;
  }
  return (
    head.anchor.requireUnchangedLine !== true ||
    (isOnUnchangedLine(head, touchedCode) && isBelowChange(head, touchedCode))
  );
}

function symbolMoved(
  { head, base }: { readonly head: AnchoredFinding; readonly base: TrackedFinding },
  { renames, symbols }: { readonly renames: Renames; readonly symbols: Symbols },
): boolean {
  return (
    head.anchor.requireUnchangedLine !== true ||
    head.symbol === undefined ||
    base.symbol === undefined ||
    (!symbols.base.has(symbolKey(head, new Map())) && !symbols.head.has(symbolKey(base, renames)))
  );
}

type Symbols = { readonly base: ReadonlySet<string>; readonly head: ReadonlySet<string> };

export function matchAnchoredFindings({
  headFindings,
  baseFindings,
  snapshots,
  renames,
  touchedCode,
}: {
  readonly headFindings: readonly TrackedFinding[];
  readonly baseFindings: readonly TrackedFinding[];
  readonly snapshots: {
    readonly base: readonly TrackedFinding[];
    readonly head: readonly TrackedFinding[];
  };
  readonly renames: Renames;
  readonly touchedCode: ChangedLines | undefined;
}): FindingPair[] {
  const symbols = {
    base: symbolsOf(snapshots.base, renames),
    head: symbolsOf(snapshots.head, new Map()),
  };
  const baseByAnchor = new Map<string, AnchoredFinding[]>();
  for (const base of baseFindings.filter(isAnchored).toSorted(byLine)) {
    const key = anchorKey(base, renames);
    addToGroup(baseByAnchor, key, base);
  }
  const pairs: FindingPair[] = [];
  for (const head of headFindings
    .filter(isAnchored)
    .filter((finding) => canMove(finding, touchedCode))
    .toSorted(byLine)) {
    const candidates = baseByAnchor.get(anchorKey(head, new Map())) ?? [];
    const index = candidates.findIndex((base) => symbolMoved({ head, base }, { renames, symbols }));
    const [base] = index === -1 ? [] : candidates.splice(index, 1);
    if (base !== undefined) {
      pairs.push({ head, base });
    }
  }
  return pairs;
}
