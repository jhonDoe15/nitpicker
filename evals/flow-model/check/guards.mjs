import { addPartial, alternatives } from './state.mjs';
import {
  OBJECT_LIKE,
  PRIMITIVE,
  factOf,
  feasible,
  possibleValues,
  primitive,
  primitiveOf,
  resolve,
} from './values.mjs';

const RELATIONS = {
  '<': (left, right) => left < right,
  '<=': (left, right) => left <= right,
  '>': (left, right) => left > right,
  '>=': (left, right) => left >= right,
  '===': (left, right) => left === right,
  '!==': (left, right) => left !== right,
  '==': looseEqual,
  '!=': (left, right) => !looseEqual(left, right),
};

function looseEqual(left, right) {
  if (typeof left === typeof right) {
    return left === right;
  }
  if (left === undefined || right === undefined) {
    return false;
  }
  return Number(left) === Number(right);
}

function unknownGuard(state, loc) {
  const options = alternatives(state, [true, false]);
  for (const [next] of options) {
    addPartial(next, { reason: 'unknown-guard', loc, detail: 'unconstrained value' });
  }
  return options;
}

function mergedFact(fact, patch) {
  return { ...fact, ...patch, neq: [...fact.neq, ...(patch.neq ?? [])] };
}

function decide(state, { atom, patches, loc }) {
  const fact = factOf(state, atom.key);
  const options = [true, false].filter((outcome) =>
    feasible(atom, mergedFact(fact, patches[String(outcome)])),
  );
  const forked = alternatives(state, options).map(([next, outcome]) => {
    next.facts.set(atom.key, mergedFact(fact, patches[String(outcome)]));
    return [next, outcome];
  });
  if (forked.length > 1 && !Array.isArray(atom.domain)) {
    for (const [next] of forked) {
      addPartial(next, { reason: 'unknown-guard', loc, detail: atom.key });
    }
  }
  return forked;
}

function sameObject(left, right) {
  if (left.t !== right.t) {
    return false;
  }
  const identity = { input: 'path', opaque: 'label', obj: 'id' }[left.t];
  return left[identity] === right[identity];
}

function withoutNaN(atom) {
  return Array.isArray(atom.domain) && !atom.domain.some((value) => Number.isNaN(value));
}

function strictEquality(state, { left, right, loc }) {
  if (OBJECT_LIKE.has(left.t) && OBJECT_LIKE.has(right.t)) {
    return [[state, sameObject(left, right)]];
  }
  if (OBJECT_LIKE.has(left.t) || OBJECT_LIKE.has(right.t)) {
    return [[state, false]];
  }
  if (left.t === 'atom' && PRIMITIVE.has(right.t)) {
    const value = primitiveOf(right);
    const patches = { true: { eq: { v: value } }, false: { neq: [value] } };
    return decide(state, { atom: left, patches, loc });
  }
  if (left.t === 'atom' && right.t === 'atom' && left.key === right.key && withoutNaN(left)) {
    return [[state, true]];
  }
  return unknownGuard(state, loc);
}

function enumerated(state, value) {
  const resolved = resolve(state, value);
  if (resolved.t !== 'atom' || !Array.isArray(resolved.domain)) {
    return [[state, resolved]];
  }
  return alternatives(state, possibleValues(state, resolved)).map(([next, item]) => {
    next.facts.set(resolved.key, { ...factOf(next, resolved.key), eq: { v: item } });
    return [next, primitive(item)];
  });
}

function relation(state, { left, right, op, loc }) {
  return enumerated(state, left).flatMap(([current, leftValue]) =>
    enumerated(current, right).flatMap(([next, rightValue]) =>
      PRIMITIVE.has(leftValue.t) && PRIMITIVE.has(rightValue.t)
        ? [[next, RELATIONS[op](primitiveOf(leftValue), primitiveOf(rightValue))]]
        : unknownGuard(next, loc),
    ),
  );
}

export function compare(state, { left, right, op, loc }) {
  const resolvedLeft = resolve(state, left);
  const resolvedRight = resolve(state, right);
  if (PRIMITIVE.has(resolvedLeft.t) && PRIMITIVE.has(resolvedRight.t)) {
    return [[state, RELATIONS[op](primitiveOf(resolvedLeft), primitiveOf(resolvedRight))]];
  }
  if (op !== '===' && op !== '!==') {
    return relation(state, { left: resolvedLeft, right: resolvedRight, op, loc });
  }
  const swap = PRIMITIVE.has(resolvedLeft.t) && resolvedRight.t === 'atom';
  const ordered = swap
    ? { left: resolvedRight, right: resolvedLeft, loc }
    : { left: resolvedLeft, right: resolvedRight, loc };
  const pairs = strictEquality(state, ordered);
  return op === '===' ? pairs : pairs.map(([next, equal]) => [next, !equal]);
}

export function truth(state, value, loc) {
  const resolved = resolve(state, value);
  if (PRIMITIVE.has(resolved.t)) {
    return [[state, Boolean(primitiveOf(resolved))]];
  }
  if (OBJECT_LIKE.has(resolved.t)) {
    return [[state, true]];
  }
  if (resolved.t === 'tmpl' && resolved.parts.some((part) => typeof part === 'string')) {
    return [[state, true]];
  }
  if (resolved.t !== 'atom') {
    return unknownGuard(state, loc);
  }
  const patches = { true: { truthy: true }, false: { truthy: false } };
  return decide(state, { atom: resolved, patches, loc });
}
