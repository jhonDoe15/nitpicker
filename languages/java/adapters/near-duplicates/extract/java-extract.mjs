import { indentOf, withLineEndingOf } from '../../../../../shared/fix/recipes/extract/text.mjs';
import { helperNameFor } from '../../../../../shared/fix/recipes/extract/names.mjs';
import { boundNames } from '../tree/names.mjs';
import {
  HELPER_AMBIGUOUS,
  enclosingMember,
  helperStyleOf,
  isAnonymous,
  methodProblem,
} from './class-shape.mjs';
import { nameTypeHoles } from './holes/type-holes.mjs';
import { typeUseProblem } from './holes/type-use.mjs';
import { droppedImports } from './cross/imports.mjs';
import { declaredOnly, withUsage } from './creation/occurrences.mjs';
import { shapeOf } from './creation/factories.mjs';
import { alignUnits, nameHoles, writtenNames } from './lockstep.mjs';
import { bodyEdit, extrasFor, helperText, insertion } from './render.mjs';
import { descendants, droppedComments, field, nameCollisions } from './syntax.mjs';

const ANONYMOUS_INSTANCE =
  'an anonymous class reads instance state or sits where the shared method cannot be static';

function alignment({ methods, cross }) {
  const [a, b] = methods;
  const pairs = ['parameters', 'type', 'body'].map((part) => [field(a, part), field(b, part)]);
  return alignUnits(methods, pairs, {
    locals: methods.map(boundNames),
    written: methods.map(writtenNames),
    wide: true,
    fields: cross?.fields,
  });
}

function reusableNames(values, method) {
  const counts = new Map();
  for (const node of descendants(method).filter(({ type }) => type === 'identifier')) {
    counts.set(node.text, (counts.get(node.text) ?? 0) + 1);
  }
  return new Map(
    values
      .filter(
        (hole) => hole.stem !== undefined && counts.get(hole.stem) === hole.occurrences.length,
      )
      .map((hole) => [hole.key, hole.stem]),
  );
}

function namedValues(values, { taken, name, method }) {
  const fixed = reusableNames(values, method);
  const named = nameHoles(
    values.filter(({ key }) => !fixed.has(key)),
    new Set([...taken, name, ...fixed.values()]),
  );
  const byKey = new Map(named?.map((hole) => [hole.key, hole]));
  return named === undefined
    ? undefined
    : values.map((hole) => byKey.get(hole.key) ?? { ...hole, name: fixed.get(hole.key) });
}

function planFor({ roots, label, claimed, methods }, aligned) {
  const taken = new Set([...roots.flatMap((root) => [...nameCollisions(root)]), ...claimed]);
  const name = helperNameFor(label, taken);
  const values = aligned.holes.filter(({ kind }) => kind !== 'type');
  const holes =
    name === undefined ? undefined : namedValues(values, { taken, name, method: methods[0] });
  const typeHoles = nameTypeHoles(
    aligned.holes.filter(({ kind }) => kind === 'type').map(withUsage),
    taken,
  );
  if (holes === undefined || typeHoles === undefined) {
    return undefined;
  }
  const used = new Set([...taken, name, ...holes.map((hole) => hole.name)]);
  return { name, holes, typeHoles, taken: used };
}

function holeNodesOf({ holes, typeHoles }) {
  return [...holes, ...typeHoles].flatMap(({ occurrences }) => occurrences.map(({ a }) => a));
}

function outdentOf({ methods, text }) {
  if (!isAnonymous(methods[0])) {
    return 0;
  }
  const [inner, outer] = [methods[0], enclosingMember(methods[0])].map(
    (node) => indentOf(text, node.startIndex).length,
  );
  return inner - outer;
}

function memberOf(method) {
  return isAnonymous(method) ? enclosingMember(method) : method;
}

export function indentUnit(method, text) {
  const member = memberOf(method);
  const owner = member.parent.parent;
  const unit = indentOf(text, member.startIndex).slice(indentOf(text, owner.startIndex).length);
  return unit === '' ? '    ' : unit;
}

export function movedComments(methods) {
  const bodies = methods.map((method) => field(method, 'body'));
  return droppedComments(
    bodies.map((root) => ({ root, from: root.startIndex, to: root.endIndex })),
  ).map((node) => node.text);
}

function editsFor(request, plan, isStatic) {
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
  return [...edits, ...droppedImports(methods[0].tree.rootNode, text, edits)];
}

function methodsProblem(methods) {
  return methodProblem(methods, true);
}

function editsOrDecline(request, plan) {
  const style = helperStyleOf(request.methods[0], holeNodesOf(plan));
  if (style === undefined) {
    return { declined: HELPER_AMBIGUOUS };
  }
  if (isAnonymous(request.methods[0]) && style !== 'static') {
    return { declined: ANONYMOUS_INSTANCE };
  }
  request.claimed.add(plan.name);
  return { edits: editsFor(request, plan, style === 'static') };
}

function holesProblem(aligned, engineHoles) {
  const values = new Set(
    aligned.holes.filter(({ kind }) => kind !== 'type').map(({ pairKey }) => pairKey),
  ).size;
  return values + aligned.typeSites === engineHoles
    ? undefined
    : 'the differing values do not match the ones the rule found';
}

export function analysedPair(request) {
  const { methods, engineHoles } = request;
  const problem = (request.methodsCheck ?? methodsProblem)(methods);
  const aligned = problem === undefined ? alignment(request) : { declined: problem };
  const mismatch = aligned.declined ?? holesProblem(aligned, engineHoles);
  if (mismatch !== undefined) {
    return { declined: mismatch };
  }
  const plan = planFor({ ...request, roots: request.roots ?? [request.root] }, aligned);
  if (plan === undefined) {
    return { declined: 'the name of the shared function would collide' };
  }
  if (plan.typeHoles.some(({ usage }) => usage === 'mixed')) {
    return { declined: 'a differing type is used as an exception type and elsewhere' };
  }
  const typed = typeUseProblem(methods[0], declaredOnly(plan.typeHoles));
  return typed === undefined ? { plan } : { declined: typed };
}

export function shapedPlan(request, plan, visibility) {
  const { methods, text } = request;
  const base = indentOf(text, memberOf(methods[0]).startIndex);
  const shape = shapeOf({
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

export function wholeExtraction(request) {
  const analysis = analysedPair(request);
  if (analysis.declined !== undefined) {
    return analysis;
  }
  const shaped = shapedPlan(request, analysis.plan, 'private');
  return shaped.declined === undefined ? editsOrDecline(request, shaped.plan) : shaped;
}
