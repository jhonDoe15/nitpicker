import type { Node } from 'web-tree-sitter';
import type {
  Attempt,
  Candidate,
  CandidateUnit,
  Candidates,
  Collected,
  Edit,
  Matches,
  ReplaceEdit,
  SourceFile,
} from '../../extract-types.mts';
import type { KotlinRequest } from './request.mts';
import {
  collected,
  lastSegment,
  nearDuplicateMatches,
  outcomeOf,
  partialCandidates,
  wholeCandidates,
} from '../../jvm-views.mts';
import { kotlinUnits } from '../../kotlin/units.mts';
import { descendants, holesOf, pairOf, present, required, runsOf } from '../syntax.mts';
import { partialExtraction } from './partial/partial.mts';
import { FUNCTION } from './syntax.mts';
import { wholeExtraction } from './whole.mts';

type Strategy = {
  readonly candidatesOf: (matches: Matches) => Candidates;
  readonly extract: (request: KotlinRequest) => Attempt<{ edits: Edit[] }>;
};
type FileSource = SourceFile & { readonly methods: Node[] };

const STRATEGIES: Readonly<Record<string, Strategy>> = {
  whole: {
    candidatesOf: (matches) => wholeCandidates(matches, { crossFile: false, textProof: false }),
    extract: wholeExtraction,
  },
  partial: { candidatesOf: partialCandidates, extract: partialExtraction },
};

function methodFor(methods: readonly Node[], unit: CandidateUnit): Node | undefined {
  const found = methods.filter(
    (node) =>
      node.startPosition.row + 1 === unit.start &&
      node.endPosition.row + 1 === unit.end &&
      required(node, 'name').text === lastSegment(unit.name),
  );
  return found.length === 1 ? found[0] : undefined;
}

function attemptFor(
  candidate: Candidate,
  { source, strategy, claimed }: { source: FileSource; strategy: Strategy; claimed: Set<string> },
): Attempt<{ edits: ReplaceEdit[] }> {
  const methods = [candidate.first, candidate.second].map((unit) =>
    methodFor(source.methods, unit),
  );
  if (methods.includes(undefined)) {
    return { declined: 'a copy is not a plain function' };
  }
  const result = strategy.extract({
    methods: pairOf(methods),
    runs: runsOf(candidate),
    label: candidate.first.name,
    engineHoles: holesOf(candidate),
    root: source.rootNode,
    text: source.text,
    claimed,
  });
  const path = source.file;
  return result.edits === undefined
    ? result
    : { edits: result.edits.map((edit): ReplaceEdit => ({ type: 'replace', path, ...edit })) };
}

export function kotlinExtractions(
  sources: readonly SourceFile[],
  { mode }: { mode: string },
): Collected {
  const strategy = present(STRATEGIES[mode]);
  const units = sources.flatMap(({ rootNode, file }) => kotlinUnits(rootNode, file));
  const { candidates, notes } = strategy.candidatesOf(
    nearDuplicateMatches(units, { isExcepted: () => false }),
  );
  const byFile = new Map(
    sources.map((source): [string, FileSource] => [
      source.file,
      { ...source, methods: descendants(source.rootNode).filter(({ type }) => type === FUNCTION) },
    ]),
  );
  const claimed = new Map(sources.map(({ file }): [string, Set<string>] => [file, new Set()]));
  const outcomes = candidates.map((candidate) => {
    const { file } = candidate.first;
    return outcomeOf(
      candidate,
      attemptFor(candidate, {
        source: present(byFile.get(file)),
        strategy,
        claimed: present(claimed.get(file)),
      }),
    );
  });
  return collected(outcomes, notes);
}
