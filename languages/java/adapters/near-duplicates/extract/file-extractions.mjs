import {
  partialCandidates,
  wholeCandidates,
} from '../../../../../shared/fix/recipes/extract/candidates.mjs';
import { lastSegment } from '../../../../../shared/fix/recipes/extract/names.mjs';
import { collected, outcomeOf } from '../../../../../shared/fix/recipes/extract/outcomes.mjs';
import { nearDuplicateMatches } from '../../../../../shared/rules/near-duplicates/near-duplicates.mjs';
import { javaUnits } from '../tree/units.mjs';
import { readerFor } from './creation/exceptions/constructors.mjs';
import { crossOutcomes } from './cross/group.mjs';
import { packageScanner } from './cross/shared-class.mjs';
import { wholeExtraction } from './java-extract.mjs';
import { partialExtraction } from './partial/partial-extract.mjs';
import { METHOD, descendants, field } from './syntax.mjs';

const STRATEGIES = {
  whole: {
    candidatesOf: (matches) => wholeCandidates(matches, { crossFile: true, textProof: true }),
    extract: wholeExtraction,
  },
  partial: { candidatesOf: partialCandidates, extract: partialExtraction },
};

function sameMethod(unit, name) {
  return (node) =>
    node.startPosition.row + 1 === unit.start &&
    node.endPosition.row + 1 === unit.end &&
    field(node, 'name').text === name;
}

function methodFor(methods, unit) {
  const found = methods.filter(sameMethod(unit, lastSegment(unit.name)));
  return found.length === 1 ? found[0] : undefined;
}

function nodesOf(candidate, sources) {
  return [candidate.first, candidate.second].map((unit) =>
    methodFor(sources.get(unit.file).methods, unit),
  );
}

function inFile(candidate, source, context) {
  const methods = nodesOf(candidate, context.sources);
  if (methods.includes(undefined)) {
    return { declined: 'a copy is not a plain method' };
  }
  const result = context.strategy.extract({
    methods,
    runs: candidate.runs,
    label: candidate.first.name,
    engineHoles: candidate.finding.parameters.length,
    root: source.rootNode,
    text: source.text,
    claimed: context.claimed.get(source.file),
    typeSources: context.typeSources,
  });
  const path = source.file;
  return result.edits === undefined
    ? result
    : { edits: result.edits.map((edit) => ({ type: 'replace', path, ...edit })) };
}

function isCrossFile({ first, second }) {
  return first.file !== second.file;
}

export function javaExtractions(sources, { mode, root, parse }) {
  const strategy = STRATEGIES[mode];
  const units = sources.flatMap(({ rootNode, file }) => javaUnits(rootNode, file));
  const matches = nearDuplicateMatches(units, { isExcepted: () => false });
  const { candidates, notes } = strategy.candidatesOf(matches);
  const byFile = new Map(
    sources.map((source) => [
      source.file,
      { ...source, methods: descendants(source.rootNode).filter(({ type }) => type === METHOD) },
    ]),
  );
  const context = {
    strategy,
    sources: byFile,
    claimed: new Map(sources.map(({ file }) => [file, new Set()])),
    typeSources: readerFor(root, sources, parse),
  };
  const here = candidates.filter((candidate) => !isCrossFile(candidate));
  const across = candidates.filter(isCrossFile).map((candidate) => ({
    candidate,
    methods: nodesOf(candidate, byFile),
    sources: [candidate.first.file, candidate.second.file].map((file) => byFile.get(file)),
  }));
  const plain = across.filter(({ methods }) => !methods.includes(undefined));
  const outcomes = [
    ...here.map((candidate) =>
      outcomeOf(candidate, inFile(candidate, byFile.get(candidate.first.file), context)),
    ),
    ...across
      .filter((entry) => !plain.includes(entry))
      .map(({ candidate }) => outcomeOf(candidate, { declined: 'a copy is not a plain method' })),
    ...crossOutcomes(plain, { scan: packageScanner(root), typeSources: context.typeSources }),
  ];
  return collected(outcomes, notes);
}
