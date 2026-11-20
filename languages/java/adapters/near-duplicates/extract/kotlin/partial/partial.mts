import type { Node } from 'web-tree-sitter';
import type { Attempt, Edit, Span } from '../../../extract-types.mts';
import type { KotlinRequest } from '../request.mts';
import { lastSegment, withLineEndingOf } from '../../../jvm-views.mts';
import {
  codeParts,
  descendants,
  droppedComments,
  identifiersWhere,
  nameCollisions,
  pairOf,
  present,
} from '../../syntax.mts';
import { alignKotlin, type KotlinAligned } from '../align/align.mts';
import { type ExtractedFunction, namedHelper } from '../align/render.mts';
import {
  type Run,
  flowProblem,
  insideNames,
  outsideType,
  runOf,
  smartCastRisk,
  typeFromDeclaration,
} from './run.mts';
import { pairProblem } from '../shape.mts';
import { declaredNames, isWritten } from '../syntax.mts';
import { bounds, partialEdits } from './edits.mts';
import type { Input } from '../../partial/partial-types.mts';
import type { Pair2, Side, Value } from './types.mts';

function variableOf(declaration: Node): Node | undefined {
  return codeParts(declaration).find(({ type }) => type === 'variable_declaration');
}

function usedAfter(run: Run, name: string): boolean {
  return run.after.some((statement) =>
    descendants(statement).some(({ type, text }) => type === 'identifier' && text === name),
  );
}

function definedAndUsed(run: Run): Node[] {
  return run.statements.filter((statement) => {
    const names = descendants(statement).filter(({ type }) => type === 'identifier');
    return (
      statement.type === 'property_declaration' &&
      codeParts(variableOf(statement) ?? statement).length > 0 &&
      names.some(({ text }) => usedAfter(run, text) && declaredNames(statement).has(text))
    );
  });
}

function valueOf(declaration: Node): Attempt<{ value: Value }> {
  const type = typeFromDeclaration(declaration);
  const keyword = codeParts(declaration).find(({ type: kind }) => kind === 'val' || kind === 'var');
  const variable = variableOf(declaration);
  if (type === undefined || keyword === undefined || variable === undefined) {
    return { declined: 'the type of the value the run defines is not written out' };
  }
  const name = present(codeParts(variable)[0]).text;
  return {
    value: { name, type, keyword: keyword.type, annotated: codeParts(variable).length > 1 },
  };
}

function sideOf(fn: Node, span: Span): Attempt<{ side: Side }> {
  const run = runOf(fn, span);
  if (run === undefined) {
    return { declined: 'a run is not a whole list of statements in the function body' };
  }
  const problem = flowProblem(run);
  const found = definedAndUsed(run);
  if (problem !== undefined || found.length > 1) {
    return { declined: problem ?? 'the run defines more than one value used after it' };
  }
  const [declaration] = found;
  const inside = insideNames(run);
  if (declaration === undefined) {
    return { side: { run, inside } };
  }
  const value = valueOf(declaration);
  return value.declined === undefined ? { side: { run, inside, output: value.value } } : value;
}

function escapes({ run, inside }: Side): boolean {
  const written = run.statements.flatMap((statement) => [
    ...identifiersWhere(statement, isWritten),
  ]);
  const known = declaredNames(run.fn);
  return written.some((name) => known.has(name) && !inside.has(name));
}

function bound(bindings: KotlinAligned['bindings'], pair: readonly [string, string]): boolean {
  return bindings.some(([left, right]) => left === pair[0] && right === pair[1]);
}

function outputProblem(sides: Pair2, bindings: KotlinAligned['bindings']): string | undefined {
  const [a, b] = [sides[0].output, sides[1].output];
  if (a === undefined || b === undefined) {
    return a === b ? undefined : 'only one run defines a value used after it';
  }
  const same = a.type === b.type && a.keyword === b.keyword && a.annotated === b.annotated;
  return same && bound(bindings, [a.name, b.name]) ? undefined : 'the runs define different values';
}

function inputsOf(sides: Pair2, bindings: KotlinAligned['bindings']): Attempt<{ inputs: Input[] }> {
  const pairs = bindings.filter(([name]) => !sides[0].inside.has(name));
  const inputs = pairs.map(([left, right]): Input | undefined => {
    const types = [outsideType(sides[0].run, left), outsideType(sides[1].run, right)];
    const [type] = types;
    return type !== undefined && type === types[1] && !type.endsWith('?')
      ? { names: [left, right], type }
      : undefined;
  });
  const risky = sides.some(({ run }) => smartCastRisk(run));
  if (risky || inputs.includes(undefined)) {
    return { declined: 'a value the run reads has no plain declared type' };
  }
  return { inputs: inputs.flatMap((input) => (input === undefined ? [] : [input])) };
}

function alignment(sides: Pair2): Attempt<KotlinAligned> {
  const [x, y] = [sides[0].run.statements, sides[1].run.statements];
  if (x.length !== y.length) {
    return { declined: 'the runs have different numbers of statements' };
  }
  const fns = sides.map(({ run }) => run.fn);
  return alignKotlin(
    x.map((statement, index): [Node, Node] => [statement, present(y[index])]),
    {
      locals: [declaredNames(present(fns[0])), declaredNames(present(fns[1]))],
      inside: [sides[0].inside, sides[1].inside],
      units: [present(fns[0]), present(fns[1])],
      prebound: [],
    },
  );
}

function sidesOf(request: KotlinRequest): Attempt<{ sides: Pair2 }> {
  const { methods, runs } = request;
  const attempts = methods.map((fn, index) => sideOf(fn, present(runs[index])));
  const missing = attempts.find((attempt) => attempt.declined !== undefined);
  return missing?.declined === undefined
    ? { sides: pairOf(attempts.map(({ side }) => side)) }
    : { declined: missing.declined };
}

function ownershipProblem(sides: Pair2): string | undefined {
  const lost = droppedComments(
    sides.map(({ run }) => ({ root: run.fn, from: bounds(run).start, to: bounds(run).end })),
  );
  if (lost.length > 0) {
    return 'the second copy has comments the shared function would drop';
  }
  return sides.some(escapes) ? 'a run assigns to a variable declared outside it' : undefined;
}

function planFunction(
  request: KotlinRequest,
  sides: Pair2,
): Attempt<{ helper: ExtractedFunction; inputs: Input[] }> {
  const aligned = alignment(sides);
  if (aligned.declined !== undefined) {
    return aligned;
  }
  const mismatch = outputProblem(sides, aligned.bindings);
  const inputs = inputsOf(sides, aligned.bindings);
  const counted = new Set(aligned.holes.map(({ pairKey }) => pairKey)).size === request.engineHoles;
  if (mismatch !== undefined || inputs.declined !== undefined || !counted) {
    return {
      declined:
        mismatch ?? inputs.declined ?? 'the differing values do not match the ones the rule found',
    };
  }
  const helper = namedHelper(
    { label: `${lastSegment(request.label)}Steps`, holes: aligned.holes },
    new Set([...nameCollisions(request.root), ...request.claimed]),
  );
  return helper === undefined
    ? { declined: 'the name of the shared function would collide' }
    : { helper, inputs: inputs.inputs };
}

export function partialExtraction(request: KotlinRequest): Attempt<{ edits: Edit[] }> {
  const problem = pairProblem(request.methods);
  const found = sidesOf(request);
  if (problem !== undefined || found.declined !== undefined) {
    return { declined: problem ?? found.declined ?? '' };
  }
  const { sides } = found;
  const refused = ownershipProblem(sides);
  const planned = refused === undefined ? planFunction(request, sides) : undefined;
  if (refused !== undefined || planned === undefined || planned.declined !== undefined) {
    return { declined: refused ?? planned?.declined ?? '' };
  }
  const { helper, inputs } = planned;
  const { claimed, text } = request;
  claimed.add(helper.name);
  return {
    edits: partialEdits(sides, { helper, inputs }, text).map((edit) => ({
      ...edit,
      text: withLineEndingOf(text, edit.text),
    })),
  };
}
