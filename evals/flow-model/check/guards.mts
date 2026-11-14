import type {
  AtomValue,
  Fact,
  FactPatch,
  Fork,
  ObjectLikeValue,
  State,
  Value,
} from '../model/run-types.mts';
import type { ComparisonOperator, Loc, Primitive } from '../model/syntax-types.mts';
import { addPartial, alternatives } from './state.mts';
import {
  domainValues,
  factOf,
  feasible,
  isObjectLike,
  isPrimitive,
  primitive,
  primitiveOf,
  resolve,
} from './values.mts';

type Patches = { readonly true: FactPatch; readonly false: FactPatch };
type OrderOperator = '<' | '<=' | '>' | '>=';

function looseEqual(left: Primitive, right: Primitive): boolean {
  if (typeof left === typeof right) {
    return left === right;
  }
  if (left === undefined || right === undefined) {
    return false;
  }
  return Number(left) === Number(right);
}

function ordered(op: OrderOperator, left: Primitive, right: Primitive): boolean {
  const [first, second]: readonly [string | number, string | number] =
    typeof left === 'string' && typeof right === 'string'
      ? [left, right]
      : [Number(left), Number(right)];
  switch (op) {
    case '<':
      return first < second;
    case '<=':
      return first <= second;
    case '>':
      return first > second;
    case '>=':
      return first >= second;
  }
}

function relate(op: ComparisonOperator, left: Primitive, right: Primitive): boolean {
  switch (op) {
    case '===':
      return left === right;
    case '!==':
      return left !== right;
    case '==':
      return looseEqual(left, right);
    case '!=':
      return !looseEqual(left, right);
    default:
      return ordered(op, left, right);
  }
}

function unknownGuard(state: State, loc: Loc | undefined): Fork<boolean> {
  const options = alternatives(state, [true, false]);
  for (const [next] of options) {
    addPartial(next, { reason: 'unknown-guard', loc, detail: 'unconstrained value' });
  }
  return options;
}

function mergedFact(fact: Fact, patch: FactPatch): Fact {
  return { ...fact, ...patch, neq: [...fact.neq, ...(patch.neq ?? [])] };
}

function patchFor(patches: Patches, outcome: boolean): FactPatch {
  return outcome ? patches.true : patches.false;
}

function decide(
  state: State,
  { atom, patches, loc }: { atom: AtomValue; patches: Patches; loc: Loc | undefined },
): Fork<boolean> {
  const fact = factOf(state, atom.key);
  const options = [true, false].filter((outcome) =>
    feasible(atom, mergedFact(fact, patchFor(patches, outcome))),
  );
  const forked = alternatives(state, options).map(([next, outcome]): [State, boolean] => {
    next.facts.set(atom.key, mergedFact(fact, patchFor(patches, outcome)));
    return [next, outcome];
  });
  if (forked.length > 1 && atom.domain === undefined) {
    for (const [next] of forked) {
      addPartial(next, { reason: 'unknown-guard', loc, detail: atom.key });
    }
  }
  return forked;
}

function identityKey(value: ObjectLikeValue): string {
  switch (value.t) {
    case 'input':
      return value.path;
    case 'opaque':
      return value.label;
    case 'obj':
      return value.id;
  }
}

function sameObject(left: ObjectLikeValue, right: ObjectLikeValue): boolean {
  return left.t === right.t && identityKey(left) === identityKey(right);
}

function withoutNaN(atom: AtomValue): boolean {
  return atom.domain !== undefined && !atom.domain.some((value) => Number.isNaN(value));
}

function strictEquality(
  state: State,
  { left, right, loc }: { left: Value; right: Value; loc: Loc | undefined },
): Fork<boolean> {
  if (isObjectLike(left) && isObjectLike(right)) {
    return [[state, sameObject(left, right)]];
  }
  if (isObjectLike(left) || isObjectLike(right)) {
    return [[state, false]];
  }
  if (left.t === 'atom' && isPrimitive(right)) {
    const value = primitiveOf(right);
    const patches: Patches = { true: { eq: { v: value } }, false: { neq: [value] } };
    return decide(state, { atom: left, patches, loc });
  }
  if (left.t === 'atom' && right.t === 'atom' && left.key === right.key && withoutNaN(left)) {
    return [[state, true]];
  }
  return unknownGuard(state, loc);
}

function enumerated(state: State, value: Value): Fork<Value> {
  const resolved = resolve(state, value);
  if (resolved.t !== 'atom' || resolved.domain === undefined) {
    return [[state, resolved]];
  }
  const key = resolved.key;
  return alternatives(state, domainValues(state, resolved, resolved.domain)).map(
    ([next, item]): [State, Value] => {
      next.facts.set(key, { ...factOf(next, key), eq: { v: item } });
      return [next, primitive(item)];
    },
  );
}

function relation(
  state: State,
  {
    left,
    right,
    op,
    loc,
  }: { left: Value; right: Value; op: ComparisonOperator; loc: Loc | undefined },
): Fork<boolean> {
  return enumerated(state, left).flatMap(([current, leftValue]) =>
    enumerated(current, right).flatMap(([next, rightValue]): Fork<boolean> =>
      isPrimitive(leftValue) && isPrimitive(rightValue)
        ? [[next, relate(op, primitiveOf(leftValue), primitiveOf(rightValue))]]
        : unknownGuard(next, loc),
    ),
  );
}

export function compare(
  state: State,
  {
    left,
    right,
    op,
    loc,
  }: { left: Value; right: Value; op: ComparisonOperator; loc: Loc | undefined },
): Fork<boolean> {
  const resolvedLeft = resolve(state, left);
  const resolvedRight = resolve(state, right);
  if (isPrimitive(resolvedLeft) && isPrimitive(resolvedRight)) {
    return [[state, relate(op, primitiveOf(resolvedLeft), primitiveOf(resolvedRight))]];
  }
  if (op !== '===' && op !== '!==') {
    return relation(state, { left: resolvedLeft, right: resolvedRight, op, loc });
  }
  const swap = isPrimitive(resolvedLeft) && resolvedRight.t === 'atom';
  const ordered = swap
    ? { left: resolvedRight, right: resolvedLeft, loc }
    : { left: resolvedLeft, right: resolvedRight, loc };
  const pairs = strictEquality(state, ordered);
  return op === '===' ? pairs : pairs.map(([next, equal]): [State, boolean] => [next, !equal]);
}

export function truth(state: State, value: Value, loc: Loc | undefined): Fork<boolean> {
  const resolved = resolve(state, value);
  if (isPrimitive(resolved)) {
    return [[state, Boolean(primitiveOf(resolved))]];
  }
  if (isObjectLike(resolved)) {
    return [[state, true]];
  }
  if (resolved.t === 'tmpl' && resolved.parts.some((part) => typeof part === 'string')) {
    return [[state, true]];
  }
  if (resolved.t !== 'atom') {
    return unknownGuard(state, loc);
  }
  const patches: Patches = { true: { truthy: true }, false: { truthy: false } };
  return decide(state, { atom: resolved, patches, loc });
}
