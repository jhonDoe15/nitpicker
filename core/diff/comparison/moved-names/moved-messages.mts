import { normalizeGitPath } from '../../git/normalize.mts';
import { remapQualifiedNames } from './qualified-names.mts';
import type { FindingPair, TrackedFinding } from '../model/finding-types.mts';
import type { BaseMoves } from './declared/move-types.mts';
import { addToGroup } from '../../../../shared/lists/lists.mts';

const LINE_REFERENCE = /\bline '?\d+'?/gu;

function keyOf(
  finding: TrackedFinding,
  { path, message }: { readonly path: string; readonly message: string },
): string {
  return JSON.stringify([
    finding.tool,
    finding.rule,
    finding.classification,
    path,
    message.replaceAll(LINE_REFERENCE, 'line'),
  ]);
}

function byLine(left: TrackedFinding, right: TrackedFinding): number {
  return (left.location?.line ?? 0) - (right.location?.line ?? 0);
}

function candidatesOf(
  baseFindings: readonly TrackedFinding[],
  moves: Pick<BaseMoves, 'names' | 'files'>,
): Map<string, TrackedFinding[]> {
  const candidates = new Map<string, TrackedFinding[]>();
  for (const base of baseFindings.toSorted(byLine)) {
    const message = remapQualifiedNames(base.message, moves.names);
    if (message !== base.message) {
      const path = normalizeGitPath(base.path);
      const key = keyOf(base, { path: moves.files.get(path) ?? path, message });
      addToGroup(candidates, key, base);
    }
  }
  return candidates;
}

export function matchMovedMessages({
  headFindings,
  baseFindings,
  moves,
}: {
  readonly headFindings: readonly TrackedFinding[];
  readonly baseFindings: readonly TrackedFinding[];
  readonly moves: Pick<BaseMoves, 'names' | 'files'>;
}): FindingPair[] {
  if (moves.names.size === 0) {
    return [];
  }
  const candidates = candidatesOf(baseFindings, moves);
  const pairs: FindingPair[] = [];
  for (const head of headFindings.toSorted(byLine)) {
    const found = candidates.get(
      keyOf(head, { path: normalizeGitPath(head.path), message: head.message }),
    );
    const base = found?.shift();
    if (base !== undefined) {
      pairs.push({ head, base });
    }
  }
  return pairs;
}
