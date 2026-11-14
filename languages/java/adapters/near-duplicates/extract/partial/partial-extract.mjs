import { withLineEndingOf } from '../../../../../../shared/fix/recipes/extract/text.mjs';
import { helperNameFor, lastSegment } from '../../../../../../shared/fix/recipes/extract/names.mjs';
import { boundNames } from '../../tree/names.mjs';
import { HELPER_AMBIGUOUS, classProblem, helperStyleOf } from '../class-shape.mjs';
import { alignUnits, nameHoles, writtenNames } from '../lockstep.mjs';
import { field, lostComments, nameCollisions, squashed } from '../syntax.mjs';
import { inputsOf, runAnalysis, thrownTypes } from './flow.mjs';
import { partialEdits } from './render.mjs';
import { insideCatchingTry, runStatements } from './runs.mjs';

function sidesOf({ methods, runs }) {
  return methods.map((method, index) => ({
    method,
    statements: runStatements(method, runs[index]),
  }));
}

function sidesProblem(sides) {
  if (sides.some(({ statements }) => statements === undefined)) {
    return 'a run is not a whole list of statements in a block';
  }
  if (sides[0].statements.length !== sides[1].statements.length) {
    return 'the runs have different numbers of statements';
  }
  if (sides.some(({ statements }) => insideCatchingTry(statements))) {
    return 'a run sits in a try block with a catch clause';
  }
  if (thrownTypes(sides[0].statements) !== thrownTypes(sides[1].statements)) {
    return 'the copies throw different exceptions';
  }
  const lost = lostComments(
    sides.map(({ method, statements }) => ({
      root: method,
      from: statements[0].startIndex,
      to: statements.at(-1).endIndex,
    })),
  );
  return lost ? 'the second copy has comments the shared method would drop' : undefined;
}

function outputsOf(sides) {
  const analyses = sides.map(({ method, statements }) => runAnalysis(method, statements));
  const problem = analyses.find((analysis) => analysis.problem !== undefined)?.problem;
  if (problem !== undefined) {
    return { declined: problem };
  }
  const [a, b] = analyses.map(({ output }) => output);
  const types = sides.map(({ method }) => squashed(field(method, 'type')));
  const sameReturn = a.kind !== 'return' || types[0] === types[1];
  const same = a.kind === b.kind && a.where === b.where && a.type === b.type && sameReturn;
  return same ? { outputs: [a, b] } : { declined: 'the runs produce different values' };
}

function alignment(sides) {
  const [x, y] = sides.map(({ statements }) => statements);
  const methods = sides.map(({ method }) => method);
  return alignUnits(
    methods,
    x.map((statement, index) => [statement, y[index]]),
    {
      locals: methods.map(boundNames),
      written: methods.map(writtenNames),
    },
  );
}

function helperStyle(sides, holes) {
  const [{ method, statements }] = sides;
  const holeNodes = holes.flatMap(({ occurrences }) => occurrences.map(({ a }) => a));
  return helperStyleOf(method, holeNodes, statements);
}

function analysis(request) {
  const problem = classProblem(request.methods);
  const sides = problem === undefined ? sidesOf(request) : [];
  const found = problem ?? sidesProblem(sides);
  const outputs = found === undefined ? outputsOf(sides) : { declined: found };
  if (outputs.declined !== undefined) {
    return outputs;
  }
  const aligned = alignment(sides);
  const inputs = aligned.declined === undefined ? inputsOf(sides, aligned.bindings) : {};
  const declined = aligned.declined ?? inputs.problem;
  return declined === undefined
    ? { sides, aligned, outputs: outputs.outputs, inputs: inputs.inputs }
    : { declined };
}

function planned(request, { found, name, holes }) {
  const style = helperStyle(found.sides, holes);
  if (style === undefined) {
    return { declined: HELPER_AMBIGUOUS };
  }
  request.claimed.add(name);
  const plan = {
    methods: request.methods,
    statements: found.sides.map(({ statements }) => statements),
    outputs: found.outputs,
    inputs: found.inputs,
    holes,
    name,
    text: request.text,
    isStatic: style === 'static',
  };
  const edits = partialEdits(plan).map((edit) => ({
    ...edit,
    text: withLineEndingOf(request.text, edit.text),
  }));
  return { edits };
}

export function partialExtraction(request) {
  const found = analysis(request);
  if (found.declined !== undefined) {
    return found;
  }
  if (found.aligned.holes.length !== request.engineHoles) {
    return { declined: 'the differing values do not match the ones the rule found' };
  }
  const taken = new Set([...nameCollisions(request.root), ...request.claimed]);
  const name = helperNameFor(`${lastSegment(request.label)}Steps`, taken);
  const holes =
    name === undefined ? undefined : nameHoles(found.aligned.holes, new Set([...taken, name]));
  if (holes === undefined) {
    return { declined: 'the name of the shared method would collide' };
  }
  return planned(request, { found, name, holes });
}
