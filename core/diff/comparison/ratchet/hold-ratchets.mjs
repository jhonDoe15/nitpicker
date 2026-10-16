import { comparisonKey } from '../fingerprint.mjs';
import { normalizeGitPath } from '../../git/normalize.mjs';
import { folderMoves, mainDestination } from '../../git/patches/renames.mjs';

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
    { touchedCode, matchedBase: new Set() },
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
  function roomOf(candidate) {
    return left.get(candidate) ?? candidate.ratchet.value;
  }
  function take(candidates, baseFinding, headFinding) {
    const { value, divisible } = headFinding.ratchet;
    if (divisible === true && value < roomOf(baseFinding)) {
      left.set(baseFinding, roomOf(baseFinding) - value);
      return;
    }
    candidates.splice(candidates.indexOf(baseFinding), 1);
  }
  return { roomOf, take };
}

function holdAgainst(headFindings, baseByRatchet, { touchedCode, matchedBase }) {
  const result = { unmatched: [], grew: [], heldFindings: [], matchedBase };
  const rooms = roomTracker();
  for (const headFinding of headFindings) {
    const candidates = holdCandidatesFor(headFinding, baseByRatchet, touchedCode) ?? [];
    const baseFinding =
      candidates.length === 0
        ? undefined
        : closestCandidate(candidates, headFinding.ratchet.value, rooms.roomOf);
    if (baseFinding === undefined) {
      result.unmatched.push(headFinding);
      continue;
    }
    if (headFinding.ratchet.value > rooms.roomOf(baseFinding)) {
      result.grew.push(grewFinding(headFinding, baseFinding.ratchet.value));
      continue;
    }
    rooms.take(candidates, baseFinding, headFinding);
    result.matchedBase.add(baseFinding);
    result.heldFindings.push({ ...headFinding, heldAtBase: baseFinding.ratchet.value });
  }
  return result;
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

function holdCandidatesFor(headFinding, baseByRatchet, touchedCode) {
  const isNeverHeld =
    headFinding.ratchet === undefined ||
    isInTouchedCode(headFinding, touchedCode) ||
    isOnAddedLine(headFinding, touchedCode) ||
    !keepsUnchangedLines(headFinding.ratchet, touchedCode);
  return isNeverHeld ? undefined : baseByRatchet.get(ratchetKey(headFinding, new Map(), new Map()));
}

function keepsUnchangedLines({ mustKeepUnchangedLines = [] }, touchedCode) {
  return mustKeepUnchangedLines.every((range) =>
    hasUnchangedLine(range, touchedCode?.changedLines.get(range.path)),
  );
}

function hasUnchangedLine({ startLine, endLine }, changed) {
  if (changed === undefined) {
    return true;
  }
  const changedCount = changed.added
    ? endLine - startLine + 1
    : changed.ranges
        .map(([start, end]) => Math.min(end, endLine) - Math.max(start, startLine) + 1)
        .filter((count) => count > 0)
        .reduce((total, count) => total + count, 0);
  return changedCount <= endLine - startLine;
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
