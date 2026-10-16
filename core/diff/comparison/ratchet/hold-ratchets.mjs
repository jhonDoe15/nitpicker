import { comparisonKey } from '../fingerprint.mjs';
import { normalizeGitPath } from '../../git/normalize.mjs';
import { folderMoves, mainDestination } from '../../git/patches/renames.mjs';
import { keepsBaseSpans } from './line-spans.mjs';

export function holdRatchetedFindings({
  newFindings,
  unmatchedBase,
  renames,
  directories,
  touchedCode,
}) {
  const atSamePath = holdAgainst(
    newFindings,
    groupBaseByRatchetKey(unmatchedBase, (finding) => ratchetKey(finding, renames, directories)),
    { touchedCode, renames, matchedBase: new Set() },
  );
  const moves = folderMoves(renames);
  const movedFolders = groupBaseByRatchetKey(
    unmatchedBase.filter(
      (baseFinding) =>
        baseFinding.ratchet?.pathIsFolder === true && !atSamePath.matchedBase.has(baseFinding),
    ),
    (finding) => movedFolderKey(finding, moves),
  );
  const atMovedPath = holdAgainst(atSamePath.unmatched, movedFolders, {
    touchedCode,
    renames,
    matchedBase: atSamePath.matchedBase,
  });
  return {
    newFindings: [...atSamePath.grew, ...atMovedPath.grew, ...atMovedPath.unmatched],
    heldFindings: [...atSamePath.heldFindings, ...atMovedPath.heldFindings],
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

function holdAgainst(headFindings, baseByRatchet, { touchedCode, renames, matchedBase }) {
  const context = { baseByRatchet, touchedCode, renames, matchedBase, rooms: roomTracker() };
  const decided = new Map();
  for (const headFinding of headFindings.toSorted(byValueDescending)) {
    decided.set(headFinding, decide(headFinding, context));
  }
  const result = { unmatched: [], grew: [], heldFindings: [], matchedBase };
  for (const headFinding of headFindings) {
    const { bucket, entry } = decided.get(headFinding);
    result[bucket].push(entry);
  }
  return result;
}

function decide(headFinding, { baseByRatchet, touchedCode, renames, matchedBase, rooms }) {
  const candidates = (
    holdCandidatesFor(headFinding, baseByRatchet, { touchedCode, renames }) ?? []
  ).filter((candidate) => !rooms.isSpent(candidate));
  const baseFinding =
    candidates.length === 0
      ? undefined
      : closestCandidate(candidates, headFinding.ratchet.value, rooms.roomOf);
  if (baseFinding === undefined) {
    return { bucket: 'unmatched', entry: headFinding };
  }
  if (headFinding.ratchet.value > rooms.roomOf(baseFinding)) {
    return { bucket: 'grew', entry: grewFinding(headFinding, baseFinding.ratchet.value) };
  }
  rooms.take(baseFinding, headFinding);
  matchedBase.add(baseFinding);
  return {
    bucket: 'heldFindings',
    entry: { ...headFinding, heldAtBase: baseFinding.ratchet.value },
  };
}

function movedFolderKey(finding, moves) {
  const destinations = moves.get(normalizeGitPath(finding.path));
  const destination = mainDestination(destinations);
  const movedFiles = destination === undefined ? 0 : destinations.get(destination);
  return movedFiles * 2 > finding.ratchet.value
    ? ratchetKey({ ...finding, path: destination }, new Map(), new Map())
    : undefined;
}

function closestCandidate(candidates, value, room) {
  const holding = candidates.filter((candidate) => room(candidate) >= value);
  const pool = holding.length > 0 ? holding : candidates;
  const pick = holding.length > 0 ? Math.min : Math.max;
  const target = pick(...pool.map((candidate) => room(candidate)));
  return pool.find((candidate) => room(candidate) === target);
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

function holdCandidatesFor(headFinding, baseByRatchet, context) {
  const { touchedCode } = context;
  const isNeverHeld =
    headFinding.ratchet === undefined ||
    isInTouchedCode(headFinding, touchedCode) ||
    isOnAddedLine(headFinding, touchedCode);
  return isNeverHeld
    ? undefined
    : baseByRatchet
        .get(ratchetKey(headFinding, new Map(), new Map()))
        ?.filter((baseFinding) => keepsBaseSpans(headFinding, baseFinding, context));
}

function grewFinding(headFinding, baseValue) {
  const { worseMessage } = headFinding.ratchet;
  return worseMessage === undefined
    ? headFinding
    : { ...headFinding, message: worseMessage.replaceAll('{base}', String(baseValue)) };
}

export function ratchetKey(finding, renames, directories) {
  return comparisonKey({ ...finding, identity: finding.ratchet.key }, renames, directories);
}

export function isInTouchedCode(finding, touchedCode) {
  if (touchedCode === undefined || finding.classification !== 'enforceable') {
    return false;
  }
  if (!touchedCode.isStrictRule(finding.rule, finding)) {
    return false;
  }
  const changed = touchedCode.changedLines.get(finding.path);
  if (changed === undefined) {
    return false;
  }
  if (changed.added) {
    return true;
  }
  if (
    finding.ratchet?.existingCodeOnly === true &&
    touchedCode.mustMeetOnEditedLines?.(finding.rule) !== true
  ) {
    return false;
  }
  const line = finding.location?.line;
  const endLine = finding.location?.endLine ?? line;
  return (
    line !== undefined && changed.ranges.some(([start, end]) => start <= endLine && line <= end)
  );
}

export function isOnAddedLine(finding, touchedCode) {
  const line = finding.location?.line;
  const inserted = touchedCode?.changedLines.get(finding.path)?.inserted;
  return (
    finding.ratchet?.existingCodeOnly === true &&
    line !== undefined &&
    (inserted ?? []).some(([start, end]) => start <= line && line <= end)
  );
}
