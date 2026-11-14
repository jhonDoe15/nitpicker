import { wholeCandidates } from '../../../../../shared/fix/recipes/extract/candidates.mjs';
import { declineNote, lastSegment } from '../../../../../shared/fix/recipes/extract/names.mjs';
import { nearDuplicateMatches } from '../../../../../shared/rules/near-duplicates/near-duplicates.mjs';
import { javaUnits } from '../tree/units.mjs';
import { wholeExtraction } from './java-extract.mjs';
import { METHOD, descendants, field } from './syntax.mjs';

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
  return wholeExtraction({
    methods: nodes,
    label: candidate.first.name,
    engineHoles: candidate.finding.parameters.length,
    root: context.rootNode,
    text: context.text,
  });
}

function outcomeOf(candidate, planned) {
  if (planned.edits === undefined) {
    return { note: declineNote(candidate.reported, planned.declined) };
  }
  return { fix: { finding: candidate.reported, edits: planned.edits } };
}

export function javaExtractions(rootNode, file, text) {
  const units = javaUnits(rootNode, file);
  const matches = nearDuplicateMatches(units, { isExcepted: () => false });
  const { candidates, notes } = wholeCandidates(matches);
  const methods = descendants(rootNode).filter(({ type }) => type === METHOD);
  const context = { methods, rootNode, text };
  const outcomes = candidates.map((candidate) =>
    outcomeOf(candidate, extractionFor(candidate, context)),
  );
  return {
    fixes: outcomes.flatMap(({ fix }) => (fix === undefined ? [] : [fix])),
    notes: [...notes, ...outcomes.flatMap(({ note }) => (note === undefined ? [] : [note]))],
  };
}
