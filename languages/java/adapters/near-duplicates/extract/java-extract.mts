import type { Node } from 'web-tree-sitter';
import type {
  Aligned,
  Attempt,
  Edit,
  NamedValueHole,
  Pair,
  PairRequest,
  Plan,
  ShapedPlan,
  ValueHole,
} from '../extract-types.mts';
import { helperNameFor, indentOf, withLineEndingOf } from '../jvm-views.mts';
import { boundNames } from '../tree/names.mts';
import { enclosingMember, isAnonymous, methodProblem } from './class-shape.mts';
import { HELPER_AMBIGUOUS, helperStyleOf } from './helper-shape/helper-style.mts';
import { boundedHoles, isBounded } from './holes/bounds.mts';
import { nameTypeHoles } from './holes/type-holes.mts';
import { typeUseProblem } from './holes/type-use.mts';
import { importEditing } from './cross/names/qualified.mts';
import { declaredOnly, withUsage } from './creation/occurrences.mts';
import { shapeOf } from './creation/factories.mts';
import { nameHoles } from './helper-shape/hole-names.mts';
import { alignUnits, writtenNames } from './lockstep.mts';
import { bodyEdit, extrasFor, helperText, insertion } from './render.mts';
import {
  descendants,
  droppedComments,
  nameCollisions,
  pairOf,
  parentOf,
  present,
  required,
} from './syntax.mts';

const ANONYMOUS_INSTANCE =
  'an anonymous class reads instance state or sits where the shared method cannot be static';

function alignment({ methods, cross }: PairRequest): Attempt<Aligned> {
  const [a, b] = methods;
  const pairs = ['parameters', 'type', 'body'].map((part): Pair => [
    required(a, part),
    required(b, part),
  ]);
  return alignUnits(methods, pairs, {
    locals: methods.map(boundNames),
    written: methods.map(writtenNames),
    wide: true,
    fields: cross?.fields,
  });
}

function reusableNames(values: readonly ValueHole[], method: Node): Map<string, string> {
  const counts = new Map<string, number>();
  for (const node of descendants(method).filter(({ type }) => type === 'identifier')) {
    counts.set(node.text, (counts.get(node.text) ?? 0) + 1);
  }
  return new Map(
    values.flatMap((hole): [string, string][] =>
      hole.stem !== undefined && counts.get(hole.stem) === hole.occurrences.length
        ? [[hole.key, hole.stem]]
        : [],
    ),
  );
}

function namedValues(
  values: readonly ValueHole[],
  { taken, name, method }: { taken: ReadonlySet<string>; name: string; method: Node },
): NamedValueHole[] | undefined {
  const fixed = reusableNames(values, method);
  const named = nameHoles(
    values.filter(({ key }) => !fixed.has(key)),
    new Set([...taken, name, ...fixed.values()]),
  );
  const byKey = new Map(named?.map((hole): [string, NamedValueHole] => [hole.key, hole]));
  return named === undefined
    ? undefined
    : values.map((hole) => byKey.get(hole.key) ?? { ...hole, name: present(fixed.get(hole.key)) });
}

function planFor(
  {
    roots,
    label,
    claimed,
    methods,
  }: { roots: readonly Node[]; label: string; claimed: ReadonlySet<string>; methods: Pair },
  aligned: Aligned,
): Plan | undefined {
  const taken = new Set([...roots.flatMap((root) => [...nameCollisions(root)]), ...claimed]);
  const name = helperNameFor(label, taken);
  const values = aligned.holes.filter((hole) => hole.kind !== 'type');
  const holes =
    name === undefined ? undefined : namedValues(values, { taken, name, method: methods[0] });
  const typeHoles = nameTypeHoles(
    aligned.holes.filter((hole) => hole.kind === 'type').map(withUsage),
    taken,
  );
  if (name === undefined || holes === undefined || typeHoles === undefined) {
    return undefined;
  }
  const used = new Set([...taken, name, ...holes.map((hole) => hole.name)]);
  return { name, holes, typeHoles, taken: used };
}

function holeNodesOf({ holes, typeHoles }: Plan): Node[] {
  return [...holes, ...typeHoles].flatMap(({ occurrences }) => occurrences.map(({ a }) => a));
}

function outdentOf({ methods, text }: PairRequest): number {
  if (!isAnonymous(methods[0])) {
    return 0;
  }
  const [inner, outer] = pairOf(
    [methods[0], enclosingMember(methods[0])].map((node) => indentOf(text, node.startIndex).length),
  );
  return inner - outer;
}

function memberOf(method: Node): Node {
  return isAnonymous(method) ? enclosingMember(method) : method;
}

export function indentUnit(method: Node, text: string): string {
  const member = memberOf(method);
  const owner = parentOf(parentOf(member));
  const unit = indentOf(text, member.startIndex).slice(indentOf(text, owner.startIndex).length);
  return unit === '' ? '    ' : unit;
}

export function movedComments(methods: readonly Node[]): string[] {
  const bodies = methods.map((method) => required(method, 'body'));
  return droppedComments(
    bodies.map((root) => ({ root, from: root.startIndex, to: root.endIndex })),
  ).map((node) => node.text);
}

function editsFor(
  request: PairRequest,
  plan: ShapedPlan,
  isStatic: boolean,
): Attempt<{ edits: Edit[] }> {
  const { methods, text } = request;
  const { name, holes, typeHoles, shape } = plan;
  const outdent = outdentOf(request);
  const parts = { holes, typeHoles, shape };
  const base = indentOf(text, memberOf(methods[0]).startIndex);
  const helper = [
    helperText({ method: methods[0], ...parts, name, isStatic, outdent, indent: base }),
    ...shape.interfaces.map(({ text: member }) => member),
  ].join(`\n\n${base}`);
  const extras = extrasFor(parts);
  const edits = [
    ...methods.map((method, side) =>
      bodyEdit({
        method,
        side,
        name,
        text,
        extras,
        moved: side === 1 ? movedComments(methods) : [],
      }),
    ),
    insertion({ method: memberOf(methods[0]), helper, text }),
  ].map((edit) => ({ ...edit, text: withLineEndingOf(text, edit.text) }));
  return importEditing(methods[0].tree.rootNode, text, edits);
}

function methodsProblem(methods: readonly Node[]): string | undefined {
  return methodProblem(methods, true);
}

function editsOrDecline(request: PairRequest, plan: ShapedPlan): Attempt<{ edits: Edit[] }> {
  const style = helperStyleOf(request.methods[0], holeNodesOf(plan));
  if (style === undefined) {
    return { declined: HELPER_AMBIGUOUS };
  }
  if (isAnonymous(request.methods[0]) && style !== 'static') {
    return { declined: ANONYMOUS_INSTANCE };
  }
  request.claimed.add(plan.name);
  return editsFor(request, plan, style === 'static');
}

function holesProblem(aligned: Aligned, engineHoles: number): string | undefined {
  const values = new Set(
    aligned.holes.filter((hole) => hole.kind !== 'type').map(({ pairKey }) => pairKey),
  ).size;
  return values + aligned.typeSites === engineHoles
    ? undefined
    : 'the differing values do not match the ones the rule found';
}

function checkedAlignment(request: PairRequest): Attempt<Aligned> {
  const problem = (request.methodsCheck ?? methodsProblem)(request.methods);
  const aligned = problem === undefined ? alignment(request) : { declined: problem };
  if (aligned.declined !== undefined) {
    return aligned;
  }
  const mismatch = holesProblem(aligned, request.engineHoles);
  return mismatch === undefined ? aligned : { declined: mismatch };
}

export function analysedPair(request: PairRequest): Attempt<{ plan: Plan }> {
  const { methods } = request;
  const aligned = checkedAlignment(request);
  if (aligned.declined !== undefined) {
    return { declined: aligned.declined };
  }
  const plan = planFor(request, aligned);
  if (plan === undefined) {
    return { declined: 'the name of the shared function would collide' };
  }
  if (plan.typeHoles.some(({ usage }) => usage === 'mixed')) {
    return { declined: 'a differing type is used as an exception type and elsewhere' };
  }
  const typeHoles = boundedHoles(methods[0], plan.typeHoles);
  const typed = typeUseProblem(
    methods[0],
    declaredOnly(typeHoles.filter((hole) => !isBounded(hole))),
  );
  return typed === undefined ? { plan: { ...plan, typeHoles } } : { declined: typed };
}

export function shapedPlan(
  request: PairRequest,
  plan: Plan,
  visibility: string,
): Attempt<{ plan: ShapedPlan }> {
  const { methods, text } = request;
  const base = indentOf(text, memberOf(methods[0]).startIndex);
  const shape = shapeOf({
    typeSources: request.typeSources,
    methods,
    typeHoles: plan.typeHoles,
    taken: plan.taken,
    text,
    base,
    unit: indentUnit(methods[0], text),
    visibility,
  });
  return shape.declined === undefined ? { plan: { ...plan, shape } } : shape;
}

export function wholeExtraction(request: PairRequest): Attempt<{ edits: Edit[] }> {
  const analysis = analysedPair(request);
  if (analysis.declined !== undefined) {
    return analysis;
  }
  const shaped = shapedPlan(request, analysis.plan, 'private');
  return shaped.declined === undefined ? editsOrDecline(request, shaped.plan) : shaped;
}
