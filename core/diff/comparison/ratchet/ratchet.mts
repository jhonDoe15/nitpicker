import { baseMoves, comparisonKey } from '../fingerprint.mts';
import { normalizeGitPath } from '../../git/normalize.mts';
import { folderMoves, mainDestination } from '../../git/patches/renames.mts';
import { growthAdviceOf, worseMessageOf } from '../model/advice-views.mts';
import { isRatcheted } from '../model/finding-guards.mts';
import type { BaseMoves } from '../moved-names/declared/move-types.mts';
import type { RatchetedFinding, MatchedCode, TrackedFinding } from '../model/finding-types.mts';
import { keepsBaseSpans } from './line-spans.mts';
import { isHeldOnTouchedLine } from './touched-code.mts';
import { addToGroup } from '../../../../shared/lists/lists.mts';

const NO_MOVES = baseMoves(new Map());

type KeyOf = (finding: RatchetedFinding, moves?: BaseMoves) => string | undefined;

type Bucket = 'unmatched' | 'grew' | 'heldFindings';

type Decision = { readonly bucket: Bucket; readonly entry: TrackedFinding };

type Rooms = ReturnType<typeof roomTracker>;

type HoldContext = {
  readonly touchedCode: MatchedCode | undefined;
  readonly moves: BaseMoves;
  readonly matchedBase: Set<TrackedFinding>;
  readonly keyOf: KeyOf;
};

type Held = {
  readonly unmatched: TrackedFinding[];
  readonly grew: TrackedFinding[];
  readonly heldFindings: TrackedFinding[];
  readonly matchedBase: Set<TrackedFinding>;
};

export function holdRatchetedFindings({
  newFindings,
  unmatchedBase,
  moves,
  touchedCode,
}: {
  readonly newFindings: readonly TrackedFinding[];
  readonly unmatchedBase: readonly TrackedFinding[];
  readonly moves: BaseMoves;
  readonly touchedCode: MatchedCode | undefined;
}): {
  readonly newFindings: TrackedFinding[];
  readonly heldFindings: TrackedFinding[];
  readonly matchedBase: Set<TrackedFinding>;
} {
  const byDeclaration = holdAgainst(
    newFindings,
    groupBaseByRatchetKey(unmatchedBase, (finding) => declarationKey(finding, moves)),
    { touchedCode, moves, matchedBase: new Set<TrackedFinding>(), keyOf: declarationKey },
  );
  const atSamePath = holdAgainst(
    byDeclaration.unmatched,
    groupBaseByRatchetKey(
      unmatchedBase.filter((baseFinding) => !byDeclaration.matchedBase.has(baseFinding)),
      (finding) => ratchetKey(finding, moves),
    ),
    { touchedCode, moves, matchedBase: byDeclaration.matchedBase, keyOf: ratchetKey },
  );
  const folders = folderMoves(moves.files);
  const movedFolders = groupBaseByRatchetKey(
    unmatchedBase.filter(
      (baseFinding) =>
        baseFinding.ratchet?.pathIsFolder === true && !atSamePath.matchedBase.has(baseFinding),
    ),
    (finding) => movedFolderKey(finding, folders),
  );
  const atMovedPath = holdAgainst(atSamePath.unmatched, movedFolders, {
    touchedCode,
    moves,
    matchedBase: atSamePath.matchedBase,
    keyOf: ratchetKey,
  });
  const passes = [byDeclaration, atSamePath, atMovedPath];
  return {
    newFindings: [...passes.flatMap(({ grew }) => grew), ...atMovedPath.unmatched],
    heldFindings: passes.flatMap(({ heldFindings }) => heldFindings),
    matchedBase: atMovedPath.matchedBase,
  };
}

function roomTracker() {
  const left = new Map<RatchetedFinding, number>();
  const spent = new Set<RatchetedFinding>();
  function roomOf(candidate: RatchetedFinding): number {
    return left.get(candidate) ?? candidate.ratchet.value;
  }
  function take(baseFinding: RatchetedFinding, headFinding: RatchetedFinding): void {
    const { value, divisible } = headFinding.ratchet;
    if (divisible === true && value < roomOf(baseFinding)) {
      left.set(baseFinding, roomOf(baseFinding) - value);
      return;
    }
    spent.add(baseFinding);
  }
  return { roomOf, take, isSpent: (candidate: RatchetedFinding) => spent.has(candidate) };
}

function byValueDescending(left: TrackedFinding, right: TrackedFinding): number {
  return (right.ratchet?.value ?? 0) - (left.ratchet?.value ?? 0);
}

function holdAgainst(
  headFindings: readonly TrackedFinding[],
  baseByRatchet: ReadonlyMap<string, RatchetedFinding[]>,
  context: HoldContext,
): Held {
  const rooms = roomTracker();
  const decided = new Map<TrackedFinding, Decision>();
  for (const headFinding of headFindings.toSorted(byValueDescending)) {
    decided.set(headFinding, decide(headFinding, { ...context, baseByRatchet, rooms }));
  }
  const result: Held = {
    unmatched: [],
    grew: [],
    heldFindings: [],
    matchedBase: context.matchedBase,
  };
  for (const headFinding of headFindings) {
    const decision = decided.get(headFinding);
    if (decision !== undefined) {
      result[decision.bucket].push(decision.entry);
    }
  }
  return result;
}

function decide(
  headFinding: TrackedFinding,
  context: HoldContext & {
    readonly baseByRatchet: ReadonlyMap<string, RatchetedFinding[]>;
    readonly rooms: Rooms;
  },
): Decision {
  const { baseByRatchet, matchedBase, rooms } = context;
  const candidates = (holdCandidatesFor(headFinding, baseByRatchet, context) ?? []).filter(
    (candidate) => !rooms.isSpent(candidate),
  );
  const baseFinding =
    candidates.length === 0 || !isRatcheted(headFinding)
      ? undefined
      : closestCandidate(candidates, headFinding.ratchet.value, rooms.roomOf);
  if (baseFinding === undefined || !isRatcheted(headFinding)) {
    return { bucket: 'unmatched', entry: headFinding };
  }
  if (headFinding.ratchet.value > rooms.roomOf(baseFinding)) {
    return { bucket: 'grew', entry: worseMessageOf(headFinding, baseFinding.ratchet.value) };
  }
  rooms.take(baseFinding, headFinding);
  matchedBase.add(baseFinding);
  return {
    bucket: 'heldFindings',
    entry: { ...headFinding, heldAtBase: baseFinding.ratchet.value },
  };
}

function movedFolderKey(
  finding: RatchetedFinding,
  folders: ReadonlyMap<string, ReadonlyMap<string, number>>,
): string | undefined {
  const destinations = folders.get(normalizeGitPath(finding.path));
  const destination = mainDestination(destinations);
  const movedFiles = destination === undefined ? 0 : (destinations?.get(destination) ?? 0);
  return destination !== undefined &&
    movedFiles * 2 > (finding.ratchet.folderFiles ?? finding.ratchet.value)
    ? ratchetKey({ ...finding, path: destination })
    : undefined;
}

function closestCandidate(
  candidates: readonly RatchetedFinding[],
  value: number,
  room: (candidate: RatchetedFinding) => number,
): RatchetedFinding | undefined {
  const holding = candidates.filter((candidate) => room(candidate) >= value);
  const pool = holding.length > 0 ? holding : candidates;
  const pick = holding.length > 0 ? Math.min : Math.max;
  const target = pick(...pool.map((candidate) => room(candidate)));
  return pool.find((candidate) => room(candidate) === target);
}

export function addGrowthAdvice({
  findings,
  baseFindings,
  moves,
}: {
  readonly findings: readonly TrackedFinding[];
  readonly baseFindings: readonly TrackedFinding[];
  readonly moves: BaseMoves;
}): TrackedFinding[] {
  const baseValues = new Map(
    baseFindings
      .filter(isRatcheted)
      .map((baseFinding): [string, number] => [
        ratchetKey(baseFinding, moves),
        baseFinding.ratchet.value,
      ]),
  );
  return findings.map((finding) => {
    const baseValue =
      isRatcheted(finding) && finding.ratchet.growthAdvice !== undefined
        ? baseValues.get(ratchetKey(finding))
        : undefined;
    return baseValue === undefined ? finding : growthAdviceOf(finding, baseValue);
  });
}

function groupBaseByRatchetKey(
  unmatchedBase: readonly TrackedFinding[],
  keyOf: KeyOf,
): Map<string, RatchetedFinding[]> {
  const baseByRatchet = new Map<string, RatchetedFinding[]>();
  for (const baseFinding of unmatchedBase.filter(isRatcheted)) {
    const key = keyOf(baseFinding);
    if (key !== undefined) {
      addToGroup(baseByRatchet, key, baseFinding);
    }
  }
  return baseByRatchet;
}

function holdCandidatesFor(
  headFinding: TrackedFinding,
  baseByRatchet: ReadonlyMap<string, RatchetedFinding[]>,
  { touchedCode, keyOf, moves }: HoldContext,
): RatchetedFinding[] | undefined {
  if (!isRatcheted(headFinding) || isHeldOnTouchedLine(headFinding, touchedCode)) {
    return undefined;
  }
  const key = keyOf(headFinding);
  return key === undefined
    ? undefined
    : baseByRatchet
        .get(key)
        ?.filter((baseFinding) =>
          keepsBaseSpans(headFinding, baseFinding, { touchedCode, renames: moves.files }),
        );
}

function ratchetKey(finding: RatchetedFinding, moves: BaseMoves = NO_MOVES): string {
  return comparisonKey({ ...finding, identity: finding.ratchet.key }, moves);
}

function declarationKey(
  finding: RatchetedFinding,
  moves: BaseMoves = NO_MOVES,
): string | undefined {
  const key = finding.ratchet.declarationKey;
  return key === undefined ? undefined : comparisonKey({ ...finding, identity: key }, moves);
}
