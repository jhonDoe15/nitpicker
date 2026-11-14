import {
  partialCandidates,
  wholeCandidates,
} from '../../../../../shared/fix/recipes/extract/candidates.mjs';
import { lastSegment } from '../../../../../shared/fix/recipes/extract/names.mjs';
import { collected, outcomeOf } from '../../../../../shared/fix/recipes/extract/outcomes.mjs';
import { nearDuplicateMatches } from '../../../../../shared/rules/near-duplicates/near-duplicates.mjs';
import { javaUnits } from '../tree/units.mjs';
import { wholeExtraction } from './java-extract.mjs';
import { partialExtraction } from './partial/partial-extract.mjs';
import { METHOD, descendants, field } from './syntax.mjs';

const STRATEGIES = {
  whole: { candidatesOf: wholeCandidates, extract: wholeExtraction },
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

function extractionFor(candidate, context) {
  const nodes = [candidate.first, candidate.second].map((unit) => methodFor(context.methods, unit));
  if (nodes.includes(undefined)) {
    return { declined: 'a copy is not a plain method' };
  }
  return context.strategy.extract({
    methods: nodes,
    runs: candidate.runs,
    label: candidate.first.name,
    engineHoles: candidate.finding.parameters.length,
    root: context.rootNode,
    text: context.text,
    claimed: context.claimed,
  });
}

export function javaExtractions(rootNode, file, { text, mode }) {
  const strategy = STRATEGIES[mode];
  const units = javaUnits(rootNode, file);
  const matches = nearDuplicateMatches(units, { isExcepted: () => false });
  const { candidates, notes } = strategy.candidatesOf(matches);
  const methods = descendants(rootNode).filter(({ type }) => type === METHOD);
  const context = { methods, rootNode, text, strategy, claimed: new Set() };
  const outcomes = candidates.map((candidate) =>
    outcomeOf(candidate, extractionFor(candidate, context)),
  );
  return collected(outcomes, notes);
}
