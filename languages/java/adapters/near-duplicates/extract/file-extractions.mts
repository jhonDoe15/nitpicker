import type { Node } from 'web-tree-sitter';
import type {
  Attempt,
  Candidate,
  CandidateUnit,
  Candidates,
  Collected,
  Edit,
  Matches,
  ParseText,
  PairRequest,
  ReplaceEdit,
  SourceFile,
  TypeSources,
} from '../extract-types.mts';
import type { PartialRequest } from './partial/partial-types.mts';
import {
  collected,
  lastSegment,
  nearDuplicateMatches,
  outcomeOf,
  partialCandidates,
  wholeCandidates,
} from '../jvm-views.mts';
import { javaUnits } from '../tree/units.mts';
import { readerFor } from './creation/exceptions/constructors.mts';
import { crossOutcomes } from './cross/group.mts';
import { packageScanner } from './cross/shared-class.mts';
import { wholeExtraction } from './java-extract.mts';
import { partialExtraction } from './partial/partial-extract.mts';
import { METHOD, descendants, pairOf, present, required } from './syntax.mts';

type FileSource = SourceFile & { readonly methods: Node[] };
type StrategyRequest = PairRequest & PartialRequest;
type Strategy = {
  readonly candidatesOf: (matches: Matches) => Candidates;
  readonly extract: (request: StrategyRequest) => Attempt<{ edits: Edit[] }>;
};
type ExtractContext = {
  readonly strategy: Strategy;
  readonly sources: ReadonlyMap<string, FileSource>;
  readonly claimed: ReadonlyMap<string, Set<string>>;
  readonly typeSources: TypeSources;
};

const STRATEGIES: Readonly<Record<string, Strategy>> = {
  whole: {
    candidatesOf: (matches) => wholeCandidates(matches, { crossFile: true, textProof: true }),
    extract: wholeExtraction,
  },
  partial: { candidatesOf: partialCandidates, extract: partialExtraction },
};

function sameMethod(unit: CandidateUnit, name: string): (node: Node) => boolean {
  return (node) =>
    node.startPosition.row + 1 === unit.start &&
    node.endPosition.row + 1 === unit.end &&
    required(node, 'name').text === name;
}

function methodFor(methods: readonly Node[], unit: CandidateUnit): Node | undefined {
  const found = methods.filter(sameMethod(unit, lastSegment(unit.name)));
  return found.length === 1 ? found[0] : undefined;
}

function nodesOf(
  candidate: Candidate,
  sources: ReadonlyMap<string, FileSource>,
): (Node | undefined)[] {
  return [candidate.first, candidate.second].map((unit) =>
    methodFor(present(sources.get(unit.file)).methods, unit),
  );
}

function inFile(
  candidate: Candidate,
  source: FileSource,
  context: ExtractContext,
): Attempt<{ edits: ReplaceEdit[] }> {
  const methods = nodesOf(candidate, context.sources);
  if (methods.includes(undefined)) {
    return { declined: 'a copy is not a plain method' };
  }
  const result = context.strategy.extract({
    methods: pairOf(methods),
    runs: candidate.runs ?? [],
    label: candidate.first.name,
    engineHoles: candidate.finding.parameters.length,
    root: source.rootNode,
    roots: [source.rootNode],
    text: source.text,
    claimed: present(context.claimed.get(source.file)),
    typeSources: context.typeSources,
  });
  const path = source.file;
  return result.edits === undefined
    ? result
    : {
        edits: result.edits.map((edit): ReplaceEdit => ({ type: 'replace', path, ...edit })),
      };
}

function isCrossFile({ first, second }: Candidate): boolean {
  return first.file !== second.file;
}

export function javaExtractions(
  sources: readonly SourceFile[],
  { mode, root, parse }: { mode: string; root: string; parse: ParseText },
): Collected {
  const strategy = present(STRATEGIES[mode]);
  const units = sources.flatMap(({ rootNode, file }) => javaUnits(rootNode, file));
  const matches = nearDuplicateMatches(units, { isExcepted: () => false });
  const { candidates, notes } = strategy.candidatesOf(matches);
  const byFile = new Map(
    sources.map((source): [string, FileSource] => [
      source.file,
      { ...source, methods: descendants(source.rootNode).filter(({ type }) => type === METHOD) },
    ]),
  );
  const context = {
    strategy,
    sources: byFile,
    claimed: new Map(sources.map(({ file }): [string, Set<string>] => [file, new Set<string>()])),
    typeSources: readerFor(root, sources, parse),
  };
  const here = candidates.filter((candidate) => !isCrossFile(candidate));
  const across = candidates.filter(isCrossFile).map((candidate) => ({
    candidate,
    methods: nodesOf(candidate, byFile),
  }));
  const plain = across.flatMap(({ candidate, methods }) =>
    methods.includes(undefined)
      ? []
      : [
          {
            candidate,
            methods: pairOf(methods),
            sources: pairOf(
              [candidate.first.file, candidate.second.file].map((file) => byFile.get(file)),
            ),
          },
        ],
  );
  const outcomes = [
    ...here.map((candidate) =>
      outcomeOf(candidate, inFile(candidate, present(byFile.get(candidate.first.file)), context)),
    ),
    ...across
      .filter(({ methods }) => methods.includes(undefined))
      .map(({ candidate }) => outcomeOf(candidate, { declined: 'a copy is not a plain method' })),
    ...crossOutcomes(plain, { scan: packageScanner(root), typeSources: context.typeSources }),
  ];
  return collected(outcomes, notes);
}
