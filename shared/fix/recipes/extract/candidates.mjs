import { RULE_IDS } from '../../../policy.mjs';
import { declineNote } from './names.mjs';

const TOOL = 'structure';
const WHOLE_VERDICTS = new Set(['same', 'parameterizable']);

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

export function wholeCandidates(matches) {
  const whole = matches.filter(({ finding }) => WHOLE_VERDICTS.has(finding.verdict));
  const crowded = sharedUnits(whole);
  const candidates = [];
  const notes = [];
  for (const match of whole) {
    const reported = reportedFinding(match);
    const sorted = byPosition(match);
    const reason =
      wholeProblem(match) ??
      (sorted.some((unit) => crowded.has(unitKey(unit)))
        ? 'a copy belongs to more than one pair of near-duplicates'
        : undefined) ??
      (overlapping(sorted) ? 'one copy contains the other' : undefined);
    if (reason === undefined) {
      candidates.push({ ...match, reported, first: sorted[0], second: sorted[1] });
    } else {
      notes.push(declineNote(reported, reason));
    }
  }
  return { candidates, notes };
}
