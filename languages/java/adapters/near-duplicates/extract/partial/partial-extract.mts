import type { Node } from 'web-tree-sitter';
import type {
  AlignHole,
  Aligned,
  Attempt,
  Edit,
  HelperStyle,
  NamedValueHole,
  Pair,
} from '../../extract-types.mts';
import type { Input, Output, PartialRequest, Side } from './partial-types.mts';
import { helperNameFor, lastSegment, withLineEndingOf } from '../../jvm-views.mts';
import { boundNames } from '../../tree/names.mts';
import { classProblem } from '../class-shape.mts';
import { HELPER_AMBIGUOUS, helperStyleOf } from '../helper-shape/helper-style.mts';
import { nameHoles } from '../helper-shape/hole-names.mts';
import { alignUnits, writtenNames } from '../lockstep.mts';
import { lostComments, nameCollisions, pairOf, present, required, squashed } from '../syntax.mts';
import { runAnalysis } from './flow.mts';
import { inputsOf, thrownTypes } from './inputs.mts';
import { partialEdits } from './render.mts';
import { insideCatchingTry, runStatements } from './runs.mts';

type MaybeSide = { method: Node; statements: Node[] | undefined };

function sidesOf({ methods, runs }: PartialRequest): MaybeSide[] {
  return methods.map((method, index) => ({
    method,
    statements: runStatements(method, present(runs[index])),
  }));
}

function completeSides(sides: readonly MaybeSide[]): Side[] {
  return sides.flatMap(({ method, statements }) =>
    statements === undefined ? [] : [{ method, statements }],
  );
}

function sidesProblem(maybe: readonly MaybeSide[]): string | undefined {
  if (maybe.some(({ statements }) => statements === undefined)) {
    return 'a run is not a whole list of statements in a block';
  }
  const sides = completeSides(maybe);
  const [first, second] = pairOf(sides);
  if (first.statements.length !== second.statements.length) {
    return 'the runs have different numbers of statements';
  }
  if (sides.some(({ statements }) => insideCatchingTry(statements))) {
    return 'a run sits in a try block with a catch clause';
  }
  if (thrownTypes(first.statements) !== thrownTypes(second.statements)) {
    return 'the copies throw different exceptions';
  }
  const lost = lostComments(
    sides.map(({ method, statements }) => ({
      root: method,
      from: present(statements[0]).startIndex,
      to: present(statements.at(-1)).endIndex,
    })),
  );
  return lost ? 'the second copy has comments the shared method would drop' : undefined;
}

function outputsOf(sides: readonly Side[]): Attempt<{ outputs: readonly [Output, Output] }> {
  const analyses = sides.map(({ method, statements }) => runAnalysis(method, statements));
  const problem = analyses.find((analysis) => analysis.problem !== undefined)?.problem;
  if (problem !== undefined) {
    return { declined: problem };
  }
  const [a, b] = pairOf(analyses.map(({ output }) => output));
  const types = sides.map(({ method }) => squashed(required(method, 'type')));
  const sameReturn = a.kind !== 'return' || types[0] === types[1];
  const same = a.kind === b.kind && a.where === b.where && a.type === b.type && sameReturn;
  return same ? { outputs: [a, b] } : { declined: 'the runs produce different values' };
}

function alignment(sides: readonly Side[]): Attempt<Aligned> {
  const [x, y] = pairOf(sides.map(({ statements }) => statements));
  const methods = sides.map(({ method }) => method);
  return alignUnits(
    methods,
    x.map((statement, index): Pair => [statement, present(y[index])]),
    {
      locals: methods.map(boundNames),
      written: methods.map(writtenNames),
      wide: false,
    },
  );
}

function helperStyle(sides: readonly Side[], holes: readonly AlignHole[]): HelperStyle | undefined {
  const { method, statements } = present(sides[0]);
  const holeNodes = holes.flatMap(({ occurrences }) => occurrences.map(({ a }) => a));
  return helperStyleOf(method, holeNodes, statements);
}

type Analysed = {
  sides: Side[];
  aligned: Aligned;
  outputs: readonly [Output, Output];
  inputs: Input[];
};

function analysis(request: PartialRequest): Attempt<Analysed> {
  const problem = classProblem(request.methods);
  const maybe = problem === undefined ? sidesOf(request) : [];
  const found = problem ?? sidesProblem(maybe);
  const sides = completeSides(maybe);
  const outputs = found === undefined ? outputsOf(sides) : { declined: found };
  if (outputs.declined !== undefined) {
    return { declined: outputs.declined };
  }
  const aligned = alignment(sides);
  if (aligned.declined !== undefined) {
    return { declined: aligned.declined };
  }
  const inputs = inputsOf(sides, aligned.bindings);
  if (inputs.problem !== undefined) {
    return { declined: inputs.problem };
  }
  return { sides, aligned, outputs: outputs.outputs, inputs: inputs.inputs };
}

function planned(
  request: PartialRequest,
  { found, name, holes }: { found: Analysed; name: string; holes: readonly NamedValueHole[] },
): Attempt<{ edits: Edit[] }> {
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

export function partialExtraction(request: PartialRequest): Attempt<{ edits: Edit[] }> {
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
    name === undefined
      ? undefined
      : nameHoles(
          found.aligned.holes.filter((hole) => hole.kind !== 'type'),
          new Set([...taken, name]),
        );
  if (holes === undefined) {
    return { declined: 'the name of the shared method would collide' };
  }
  return planned(request, { found, name: present(name), holes });
}
