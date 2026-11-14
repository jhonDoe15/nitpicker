import { withLineEndingOf } from '../../../../../shared/fix/recipes/extract/text.mjs';
import { helperNameFor } from '../../../../../shared/fix/recipes/extract/names.mjs';
import { boundNames } from '../tree/names.mjs';
import { HELPER_AMBIGUOUS, helperStyleOf, methodProblem } from './class-shape.mjs';
import { alignUnits, nameHoles, writtenNames } from './lockstep.mjs';
import { bodyEdit, helperText, insertion } from './render.mjs';
import { field, lostComments, nameCollisions } from './syntax.mjs';

function alignment(methods) {
  const [a, b] = methods;
  const pairs = ['parameters', 'type', 'body'].map((part) => [field(a, part), field(b, part)]);
  return alignUnits(methods, pairs, {
    locals: methods.map(boundNames),
    written: methods.map(writtenNames),
  });
}

function planFor({ root, label, claimed }, aligned) {
  const taken = new Set([...nameCollisions(root), ...claimed]);
  const name = helperNameFor(label, taken);
  const holes =
    name === undefined ? undefined : nameHoles(aligned.holes, new Set([...taken, name]));
  return holes === undefined ? undefined : { name, holes };
}

function holeNodesOf(holes) {
  return holes.flatMap(({ occurrences }) => occurrences.map(({ a }) => a));
}

function editsFor({ methods, text }, { name, holes }, isStatic) {
  const helper = helperText({ method: methods[0], holes, name, isStatic });
  return [
    ...methods.map((method, side) => bodyEdit({ method, side, name, holes, text })),
    insertion({ method: methods[0], helper, text }),
  ].map((edit) => ({ ...edit, text: withLineEndingOf(text, edit.text) }));
}

function methodsProblem(methods) {
  const bodies = methods.map((method) => field(method, 'body'));
  if (
    lostComments(bodies.map((body) => ({ root: body, from: body.startIndex, to: body.endIndex })))
  ) {
    return 'the second copy has comments the shared function would drop';
  }
  return methodProblem(methods);
}

function editsOrDecline(request, plan) {
  const style = helperStyleOf(request.methods[0], holeNodesOf(plan.holes));
  if (style === undefined) {
    return { declined: HELPER_AMBIGUOUS };
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
  if (aligned.holes.length !== engineHoles) {
    return { declined: 'the differing values do not match the ones the rule found' };
  }
  const plan = planFor(request, aligned);
  if (plan === undefined) {
    return { declined: 'the name of the shared function would collide' };
  }
  return editsOrDecline(request, plan);
}
