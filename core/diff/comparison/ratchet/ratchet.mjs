import { comparisonKey } from '../fingerprint.mjs';
import { normalizeGitPath } from '../../git/normalize.mjs';
import { folderMoves, mainDestination } from '../../git/patches/renames.mjs';
import { insertBeforeRoute } from '../../../../shared/messages/exception-sentence.mjs';
import { isInTouchedCode, isOnAddedLine } from './touched-code.mjs';

const NO_RENAMES = new Map();

export function holdRatchetedFindings({
  newFindings,
  unmatchedBase,
  renames,
  directories,
  touchedCode,
}) {
  const byDeclaration = holdAgainst(
    newFindings,
    groupBaseByRatchetKey(unmatchedBase, (finding) =>
      declarationKey(finding, renames, directories),
    ),
    { touchedCode, matchedBase: new Set(), keyOf: declarationKey },
  );
  const atSamePath = holdAgainst(
    byDeclaration.unmatched,
    groupBaseByRatchetKey(
      unmatchedBase.filter((baseFinding) => !byDeclaration.matchedBase.has(baseFinding)),
      (finding) => ratchetKey(finding, renames, directories),
    ),
    { touchedCode, matchedBase: byDeclaration.matchedBase, keyOf: ratchetKey },
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
    keyOf: ratchetKey,
  });
  const passes = [byDeclaration, atSamePath, atMovedPath];
  return {
    newFindings: [...passes.flatMap(({ grew }) => grew), ...atMovedPath.unmatched],
    heldFindings: passes.flatMap(({ heldFindings }) => heldFindings),
    matchedBase: atMovedPath.matchedBase,
  };
}

function holdAgainst(headFindings, baseByRatchet, { touchedCode, matchedBase, keyOf }) {
  const result = { unmatched: [], grew: [], heldFindings: [], matchedBase };
  for (const headFinding of headFindings) {
    const candidates = holdCandidatesFor(headFinding, baseByRatchet, { touchedCode, keyOf });
    const baseFinding =
      candidates === undefined || candidates.length === 0
        ? undefined
        : closestCandidate(candidates, headFinding.ratchet.value);
    if (baseFinding === undefined) {
      result.unmatched.push(headFinding);
      continue;
    }
    if (headFinding.ratchet.value > baseFinding.ratchet.value) {
      result.grew.push(grewFinding(headFinding, baseFinding.ratchet.value));
      continue;
    }
    candidates.splice(candidates.indexOf(baseFinding), 1);
    result.matchedBase.add(baseFinding);
    result.heldFindings.push({ ...headFinding, heldAtBase: baseFinding.ratchet.value });
  }
  return result;
}

function movedFolderKey(finding, moves) {
  const destinations = moves.get(normalizeGitPath(finding.path));
  const destination = mainDestination(destinations);
  const movedFiles = destination === undefined ? 0 : destinations.get(destination);
  return movedFiles * 2 > (finding.ratchet.folderFiles ?? finding.ratchet.value)
    ? ratchetKey({ ...finding, path: destination }, NO_RENAMES, NO_RENAMES)
    : undefined;
}

function closestCandidate(candidates, value) {
  const holding = candidates.filter((candidate) => candidate.ratchet.value >= value);
  const pool = holding.length > 0 ? holding : candidates;
  const pick = holding.length > 0 ? Math.min : Math.max;
  const target = pick(...pool.map((candidate) => candidate.ratchet.value));
  return pool.find((candidate) => candidate.ratchet.value === target);
}

export function withGrowthAdvice({ findings, baseFindings, renames, directories }) {
  const baseValues = new Map(
    baseFindings
      .filter((baseFinding) => baseFinding.ratchet !== undefined)
      .map((baseFinding) => [
        ratchetKey(baseFinding, renames, directories),
        baseFinding.ratchet.value,
      ]),
  );
  return findings.map((finding) => {
    const advice = finding.ratchet?.growthAdvice;
    const baseValue =
      advice === undefined
        ? undefined
        : baseValues.get(ratchetKey(finding, NO_RENAMES, NO_RENAMES));
    return baseValue === undefined
      ? finding
      : {
          ...finding,
          message: insertBeforeRoute(
            finding.message,
            advice.replaceAll('{base}', String(baseValue)),
          ),
        };
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

function holdCandidatesFor(headFinding, baseByRatchet, { touchedCode, keyOf }) {
  const isNeverHeld =
    headFinding.ratchet === undefined ||
    isInTouchedCode(headFinding, touchedCode) ||
    isOnAddedLine(headFinding, touchedCode);
  const key = isNeverHeld ? undefined : keyOf(headFinding, NO_RENAMES, NO_RENAMES);
  return key === undefined ? undefined : baseByRatchet.get(key);
}

export function grewFinding(headFinding, baseValue) {
  const { worseMessage } = headFinding.ratchet;
  return worseMessage === undefined
    ? headFinding
    : { ...headFinding, message: worseMessage.replaceAll('{base}', String(baseValue)) };
}

function ratchetKey(finding, renames, directories) {
  return comparisonKey({ ...finding, identity: finding.ratchet.key }, renames, directories);
}

function declarationKey(finding, renames, directories) {
  const key = finding.ratchet.declarationKey;
  return key === undefined
    ? undefined
    : comparisonKey({ ...finding, identity: key }, renames, directories);
}
