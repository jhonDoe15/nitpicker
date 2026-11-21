import path from 'node:path';
import { RULE_IDS } from '../../../policy.mts';
import { declineNote } from './names.mts';
import { fieldOf, isPlainObject, listOf } from '../../../values/readers.mts';
import type {
  Candidate,
  CandidateOutcome,
  Candidates,
  ExtractOptions,
  Match,
  MatchUnit,
  PartialCandidate,
} from './typed/extract-types.mts';

const TOOL = 'structure';
const WHOLE_VERDICTS: ReadonlySet<string> = new Set(['same', 'parameterizable']);
const NO_PROOF: ExtractOptions = { crossFile: false, textProof: false };
const CROWDED = 'a copy belongs to more than one pair of near-duplicates';

function isUnit(value: unknown): value is MatchUnit {
  return (
    typeof fieldOf(value, 'file') === 'string' &&
    typeof fieldOf(value, 'start') === 'number' &&
    typeof fieldOf(value, 'end') === 'number'
  );
}

function isMatch(value: unknown): value is Match {
  const pair = fieldOf(value, 'pair');
  return (
    Array.isArray(pair) &&
    pair.length === 2 &&
    pair.every(isUnit) &&
    isPlainObject(fieldOf(value, 'finding'))
  );
}

function reportedFinding({ pair: [here] }: Match): Candidate['reported'] {
  return { tool: TOOL, rule: RULE_IDS.nearDuplicate, path: here.file, line: here.start };
}

function filesProblem([first, second]: Match['pair'], crossFile: boolean): string | undefined {
  if (first.file === second.file) {
    return undefined;
  }
  if (!crossFile) {
    return 'the copies are in different files';
  }
  return path.posix.dirname(first.file) === path.posix.dirname(second.file)
    ? undefined
    : 'the copies are in different folders';
}

function wholeProblem({ finding, pair }: Match, options: ExtractOptions): string | undefined {
  const files = filesProblem(pair, options.crossFile);
  if (files !== undefined) {
    return files;
  }
  if (finding.proof !== undefined || (finding.rewritten && !options.textProof)) {
    return 'the copies match only after their code is rewritten';
  }
  return undefined;
}

function unitKey({ file, name }: MatchUnit): string {
  return `${file}#${name}`;
}

function byPosition({ pair: [left, right] }: Match): readonly [MatchUnit, MatchUnit] {
  const order = left.file.localeCompare(right.file) || left.start - right.start;
  return order <= 0 ? [left, right] : [right, left];
}

function overlapping([first, second]: readonly [MatchUnit, MatchUnit]): boolean {
  return first.file === second.file && second.start <= first.end;
}

function sharedUnits(matches: readonly Match[]): Set<string> {
  const counts = new Map<string, number>();
  for (const { pair } of matches) {
    for (const unit of pair) {
      counts.set(unitKey(unit), (counts.get(unitKey(unit)) ?? 0) + 1);
    }
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name));
}

function candidateOf(
  match: Match,
  crowded: ReadonlySet<string>,
  options: ExtractOptions,
): CandidateOutcome {
  const reported = reportedFinding(match);
  const sorted = byPosition(match);
  const reason =
    wholeProblem(match, options) ??
    (sorted.some((unit) => crowded.has(unitKey(unit))) ? CROWDED : undefined) ??
    (overlapping(sorted) ? 'one copy contains the other' : undefined);
  return reason === undefined
    ? { candidate: { ...match, reported, first: sorted[0], second: sorted[1] } }
    : { note: declineNote(reported, reason) };
}

function partitionedCandidates(
  matches: unknown,
  verdicts: ReadonlySet<string>,
  options: ExtractOptions = NO_PROOF,
): Candidates<Candidate> {
  const chosen = listOf(matches)
    .filter(isMatch)
    .filter(({ finding }) => verdicts.has(finding.verdict));
  const crowded = sharedUnits(chosen);
  const outcomes = chosen.map((match) => candidateOf(match, crowded, options));
  return {
    candidates: outcomes.flatMap(({ candidate }) => (candidate === undefined ? [] : [candidate])),
    notes: outcomes.flatMap(({ note }) => (note === undefined ? [] : [note])),
  };
}

export function wholeCandidates(
  matches: unknown,
  options: ExtractOptions = NO_PROOF,
): Candidates<Candidate> {
  return partitionedCandidates(matches, WHOLE_VERDICTS, options);
}

export function partialCandidates(matches: unknown): Candidates<PartialCandidate> {
  const found = partitionedCandidates(matches, new Set(['partial-run']));
  return {
    ...found,
    candidates: found.candidates.map((candidate) => ({
      ...candidate,
      runs: [candidate.first, candidate.second].map(({ side }) => candidate.finding.run?.[side]),
    })),
  };
}
