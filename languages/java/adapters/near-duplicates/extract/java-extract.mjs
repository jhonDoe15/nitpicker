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
import { alignUnits, nameHoles, writtenNames } from './lockstep.mjs';
import { bodyEdit, helperText, insertion } from './render.mjs';
import { field, lostComments, nameCollisions } from './syntax.mjs';

const ANONYMOUS_INSTANCE =
  'an anonymous class reads instance state or sits where the shared method cannot be static';

function alignment(methods) {
  const [a, b] = methods;
  const pairs = ['parameters', 'type', 'body'].map((part) => [field(a, part), field(b, part)]);
  return alignUnits(methods, pairs, {
    locals: methods.map(boundNames),
    written: methods.map(writtenNames),
    wide: true,
  });
}

function planFor({ root, label, claimed }, aligned) {
  const taken = new Set([...nameCollisions(root), ...claimed]);
  const name = helperNameFor(label, taken);
  const values = aligned.holes.filter(({ kind }) => kind !== 'type');
  const holes = name === undefined ? undefined : nameHoles(values, new Set([...taken, name]));
  const typeHoles = nameTypeHoles(
    aligned.holes.filter(({ kind }) => kind === 'type'),
    taken,
  );
  return holes === undefined || typeHoles === undefined ? undefined : { name, holes, typeHoles };
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

function editsFor(request, { name, holes, typeHoles }, isStatic) {
  const { methods, text } = request;
  const outdent = outdentOf(request);
  const helper = helperText({ method: methods[0], holes, typeHoles, name, isStatic, outdent });
  return [
    ...methods.map((method, side) => bodyEdit({ method, side, name, holes, text })),
    insertion({
      method: isAnonymous(methods[0]) ? enclosingMember(methods[0]) : methods[0],
      helper,
      text,
    }),
  ].map((edit) => ({ ...edit, text: withLineEndingOf(text, edit.text) }));
}

function methodsProblem(methods) {
  const bodies = methods.map((method) => field(method, 'body'));
  if (
    lostComments(bodies.map((body) => ({ root: body, from: body.startIndex, to: body.endIndex })))
  ) {
    return 'the second copy has comments the shared function would drop';
  }
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

export function wholeExtraction(request) {
  const { methods, engineHoles } = request;
  const problem = methodsProblem(methods);
  if (problem !== undefined) {
    return { declined: problem };
  }
  const aligned = alignment(methods);
  if (aligned.declined !== undefined) {
    return aligned;
  }
  const values = new Set(
    aligned.holes.filter(({ kind }) => kind !== 'type').map(({ pairKey }) => pairKey),
  ).size;
  if (values + aligned.typeSites !== engineHoles) {
    return { declined: 'the differing values do not match the ones the rule found' };
  }
  const plan = planFor(request, aligned);
  if (plan === undefined) {
    return { declined: 'the name of the shared function would collide' };
  }
  const typed = typeUseProblem(methods[0], plan.typeHoles);
  return typed === undefined ? editsOrDecline(request, plan) : { declined: typed };
}
