import { baseMoves, comparisonKey } from '../fingerprint.mjs';
import { normalizeGitPath } from '../../git/normalize.mjs';
import { folderMoves, mainDestination } from '../../git/patches/renames.mjs';
import { withGrowthAdvice, withWorseMessage } from '../../../../shared/messages/finding-advice.mjs';
import { keepsBaseSpans } from './line-spans.mjs';
import { isInTouchedCode, isOnAddedLine } from './touched-code.mjs';

const NO_MOVES = baseMoves(new Map());

export function holdRatchetedFindings({ newFindings, unmatchedBase, moves, touchedCode }) {
  const byDeclaration = holdAgainst(
    newFindings,
    groupBaseByRatchetKey(unmatchedBase, (finding) => declarationKey(finding, moves)),
    { touchedCode, moves, matchedBase: new Set(), keyOf: declarationKey },
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
  const left = new Map();
  const spent = new Set();
  function roomOf(candidate) {
    return left.get(candidate) ?? candidate.ratchet.value;
  }
  function take(baseFinding, headFinding) {
    const { value, divisible } = headFinding.ratchet;
    if (divisible === true && value < roomOf(baseFinding)) {
      left.set(baseFinding, roomOf(baseFinding) - value);
      return;
    }
    spent.add(baseFinding);
  }
  return { roomOf, take, isSpent: (candidate) => spent.has(candidate) };
}

function byValueDescending(left, right) {
  return (right.ratchet?.value ?? 0) - (left.ratchet?.value ?? 0);
}

function holdAgainst(headFindings, baseByRatchet, context) {
  const rooms = roomTracker();
  const decided = new Map();
  for (const headFinding of headFindings.toSorted(byValueDescending)) {
    decided.set(headFinding, decide(headFinding, { ...context, baseByRatchet, rooms }));
  }
  const result = {
    unmatched: [],
    grew: [],
    heldFindings: [],
    matchedBase: context.matchedBase,
  };
  for (const headFinding of headFindings) {
    const { bucket, entry } = decided.get(headFinding);
    result[bucket].push(entry);
  }
  return result;
}

function decide(headFinding, context) {
  const { baseByRatchet, matchedBase, rooms } = context;
  const candidates = (holdCandidatesFor(headFinding, baseByRatchet, context) ?? []).filter(
    (candidate) => !rooms.isSpent(candidate),
  );
  const baseFinding =
    candidates.length === 0
      ? undefined
      : closestCandidate(candidates, headFinding.ratchet.value, rooms.roomOf);
  if (baseFinding === undefined) {
    return { bucket: 'unmatched', entry: headFinding };
  }
  if (headFinding.ratchet.value > rooms.roomOf(baseFinding)) {
    return { bucket: 'grew', entry: withWorseMessage(headFinding, baseFinding.ratchet.value) };
  }
  rooms.take(baseFinding, headFinding);
  matchedBase.add(baseFinding);
  return {
    bucket: 'heldFindings',
    entry: { ...headFinding, heldAtBase: baseFinding.ratchet.value },
  };
}

function movedFolderKey(finding, folders) {
  const destinations = folders.get(normalizeGitPath(finding.path));
  const destination = mainDestination(destinations);
  const movedFiles = destination === undefined ? 0 : destinations.get(destination);
  return movedFiles * 2 > (finding.ratchet.folderFiles ?? finding.ratchet.value)
    ? ratchetKey({ ...finding, path: destination })
    : undefined;
}

function closestCandidate(candidates, value, room) {
  const holding = candidates.filter((candidate) => room(candidate) >= value);
  const pool = holding.length > 0 ? holding : candidates;
  const pick = holding.length > 0 ? Math.min : Math.max;
  const target = pick(...pool.map((candidate) => room(candidate)));
  return pool.find((candidate) => room(candidate) === target);
}

export function addGrowthAdvice({ findings, baseFindings, moves }) {
  const baseValues = new Map(
    baseFindings
      .filter((baseFinding) => baseFinding.ratchet !== undefined)
      .map((baseFinding) => [ratchetKey(baseFinding, moves), baseFinding.ratchet.value]),
  );
  return findings.map((finding) => {
    const advice = finding.ratchet?.growthAdvice;
    const baseValue = advice === undefined ? undefined : baseValues.get(ratchetKey(finding));
    return baseValue === undefined ? finding : withGrowthAdvice(finding, baseValue);
  });
}

function groupBaseByRatchetKey(unmatchedBase, keyOf) {
  const baseByRatchet = new Map();
  const keyed = unmatchedBase
    .filter((baseFinding) => baseFinding.ratchet !== undefined)
    .map((baseFinding) => [keyOf(baseFinding), baseFinding])
    .filter(([key]) => key !== undefined);
  for (const [key, baseFinding] of keyed) {
    baseByRatchet.set(key, [...(baseByRatchet.get(key) ?? []), baseFinding]);
  }
  return baseByRatchet;
}

function holdCandidatesFor(headFinding, baseByRatchet, { touchedCode, keyOf, moves }) {
  const isNeverHeld =
    headFinding.ratchet === undefined ||
    isInTouchedCode(headFinding, touchedCode) ||
    isOnAddedLine(headFinding, touchedCode);
  const key = isNeverHeld ? undefined : keyOf(headFinding);
  return key === undefined
    ? undefined
    : baseByRatchet
        .get(key)
        ?.filter((baseFinding) =>
          keepsBaseSpans(headFinding, baseFinding, { touchedCode, renames: moves.files }),
        );
}

function ratchetKey(finding, moves = NO_MOVES) {
  return comparisonKey({ ...finding, identity: finding.ratchet.key }, moves);
}

function declarationKey(finding, moves = NO_MOVES) {
  const key = finding.ratchet.declarationKey;
  return key === undefined ? undefined : comparisonKey({ ...finding, identity: key }, moves);
}
