import { freshName, helperNameFor } from '../../../../../shared/fix/recipes/extract/names.mjs';
import { boundNames } from '../tree/names.mjs';
import {
  canDeclareStatics,
  hasModifier,
  methodProblem,
  usesInstanceState,
} from './class-shape.mjs';
import { alignUnits, writtenNames } from './lockstep.mjs';
import { bodyEdit, helperText, insertion } from './render.mjs';
import { field, nameCollisions } from './syntax.mjs';

function flowName(node) {
  const declarator = node.parent;
  if (declarator.type === 'variable_declarator') {
    return field(declarator, 'name').text;
  }
  return node.type === 'identifier' ? node.text : undefined;
}

function nameHoles(holes, taken) {
  const names = new Set(taken);
  const named = [];
  for (const hole of holes) {
    const name = freshName(flowName(hole.occurrences[0].a), names);
    if (name === undefined) {
      return undefined;
    }
    names.add(name);
    named.push({ ...hole, name });
  }
  return named;
}

function alignment(methods) {
  const [a, b] = methods;
  const pairs = ['parameters', 'type', 'body'].map((part) => [field(a, part), field(b, part)]);
  return alignUnits(methods, pairs, {
    locals: methods.map(boundNames),
    written: methods.map(writtenNames),
  });
}

function planFor({ root, label }, aligned) {
  const taken = nameCollisions(root);
  const name = helperNameFor(label, taken);
  const holes =
    name === undefined ? undefined : nameHoles(aligned.holes, new Set([...taken, name]));
  return holes === undefined ? undefined : { name, holes };
}

function isStaticHelper(method, holes) {
  const holeNodes = holes.flatMap(({ occurrences }) => occurrences.map(({ a }) => a));
  return (
    hasModifier(method, 'static') ||
    (canDeclareStatics(method) && !usesInstanceState(method, holeNodes))
  );
}

function editsFor({ methods, text }, { name, holes }) {
  const isStatic = isStaticHelper(methods[0], holes);
  const helper = helperText({ method: methods[0], holes, name, isStatic });
  return [
    ...methods.map((method, side) => bodyEdit({ method, side, name, holes, text })),
    insertion({ method: methods[0], helper, text }),
  ];
}

export function wholeExtraction(request) {
  const { methods, engineHoles } = request;
  const problem = methodProblem(methods);
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
  return { edits: editsFor(request, plan) };
}
