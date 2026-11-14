import { RULE_IDS } from '../../../policy.mjs';
import { declineNote } from './names.mjs';

const TOOL = 'structure';
const WHOLE_VERDICTS = new Set(['same', 'parameterizable']);
const CROWDED = 'a copy belongs to more than one pair of near-duplicates';

function reportedFinding({ pair: [here] }) {
  return { tool: TOOL, rule: RULE_IDS.nearDuplicate, path: here.file, line: here.start };
}

function wholeProblem({ finding, pair }) {
  if (pair[0].file !== pair[1].file) {
    return 'the copies are in different files';
  }
  if (finding.proof !== undefined || finding.rewritten) {
    return 'the copies match only after their code is rewritten';
  }
  return undefined;
}

function unitKey({ file, name }) {
  return `${file}#${name}`;
}

function byPosition({ pair }) {
  return pair.toSorted((left, right) => left.start - right.start);
}

function overlapping([first, second]) {
  return second.start <= first.end;
}

function sharedUnits(matches) {
  const counts = new Map();
  for (const { pair } of matches) {
    for (const unit of pair) {
      counts.set(unitKey(unit), (counts.get(unitKey(unit)) ?? 0) + 1);
    }
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name));
}

function candidateOf(match, crowded) {
  const reported = reportedFinding(match);
  const sorted = byPosition(match);
  const reason =
    wholeProblem(match) ??
    (sorted.some((unit) => crowded.has(unitKey(unit))) ? CROWDED : undefined) ??
    (overlapping(sorted) ? 'one copy contains the other' : undefined);
  return reason === undefined
    ? { candidate: { ...match, reported, first: sorted[0], second: sorted[1] } }
    : { note: declineNote(reported, reason) };
}

function partitionedCandidates(matches, verdicts) {
  const chosen = matches.filter(({ finding }) => verdicts.has(finding.verdict));
  const crowded = sharedUnits(chosen);
  const outcomes = chosen.map((match) => candidateOf(match, crowded));
  return {
    candidates: outcomes.flatMap(({ candidate }) => (candidate === undefined ? [] : [candidate])),
    notes: outcomes.flatMap(({ note }) => (note === undefined ? [] : [note])),
  };
}

export function wholeCandidates(matches) {
  return partitionedCandidates(matches, WHOLE_VERDICTS);
}

export function partialCandidates(matches) {
  const found = partitionedCandidates(matches, new Set(['partial-run']));
  return {
    ...found,
    candidates: found.candidates.map((candidate) => ({
      ...candidate,
      runs: [candidate.first, candidate.second].map(({ side }) => candidate.finding.run[side]),
    })),
  };
}
