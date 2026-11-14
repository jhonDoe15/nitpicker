import {
  recordTypeHole,
  typePairProblem,
} from '../../../../../../shared/fix/recipes/extract/bijection.mjs';
import { namedChildren, squashed } from '../syntax.mjs';

const DIFFERENT = 'the copies use different types';

function zipped(left, right) {
  return left.length === right.length
    ? { pairs: left.map((node, index) => [node, right[index]]) }
    : { declined: DIFFERENT };
}

function genericParts(x, y) {
  const [[rawX, argumentsX], [rawY, argumentsY]] = [x, y].map((node) => namedChildren(node));
  if (squashed(rawX) !== squashed(rawY)) {
    return { declined: DIFFERENT };
  }
  return zipped(namedChildren(argumentsX), namedChildren(argumentsY));
}

function arrayParts(x, y) {
  const [left, right] = [x, y].map((node) => node.namedChildren);
  const dimensions = [left.at(-1), right.at(-1)].map((node) => squashed(node));
  return dimensions[0] === dimensions[1]
    ? { pairs: [[left[0], right[0]]] }
    : { declined: DIFFERENT };
}

function partsOf(x, y) {
  if (x.type !== y.type) {
    return { declined: DIFFERENT };
  }
  if (x.type === 'generic_type') {
    return genericParts(x, y);
  }
  return x.type === 'array_type' ? arrayParts(x, y) : { declined: DIFFERENT };
}

function expand(state, [x, y], pending) {
  const texts = [x, y].map((node) => squashed(node));
  if (texts[0] === texts[1]) {
    return undefined;
  }
  if (x.type === 'type_identifier' && y.type === 'type_identifier') {
    recordTypeHole(state.holes, [x, y], texts);
    return undefined;
  }
  const parts = partsOf(x, y);
  pending.push(...(parts.pairs ?? []));
  return parts.declined;
}

export function typeStep(state, x, y) {
  function expandIn(pair, pending) {
    return expand(state, pair, pending);
  }
  return typePairProblem(state.typeSites, [x, y], { textOf: squashed, expand: expandIn });
}

const TYPE_NAMES = [
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
  ...Array.from({ length: 20 }, (_, index) => `T${index + 1}`),
];

export function nameTypeHoles(holes, taken) {
  const free = TYPE_NAMES.filter((name) => !taken.has(name));
  return holes.length > free.length
    ? undefined
    : holes.map((hole, index) => ({ ...hole, name: free[index] }));
}
