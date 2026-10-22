import { UNDEFINED, alternatives } from './state.mjs';

const OBJECT_LIKE = new Set(['input', 'opaque', 'obj']);
const PRIMITIVE = new Set(['lit', 'undef']);

function specAt(inputs, path) {
  let spec = inputs;
  for (const part of path.split('.')) {
    spec =
      spec !== null && typeof spec === 'object' && !Array.isArray(spec) ? spec[part] : undefined;
  }
  return spec;
}

function atomKey(path, state) {
  return state.epoch === 0 ? path : `${path}@${String(state.epoch)}`;
}

export function inputValue(spec, path, state) {
  if (spec === 'effects' || spec === 'object') {
    return { t: 'input', path };
  }
  if (spec !== null && typeof spec === 'object') {
    return Array.isArray(spec.oneOf)
      ? { t: 'atom', key: atomKey(path, state), domain: spec.oneOf }
      : { t: 'input', path };
  }
  return spec === undefined ? { t: 'atom', key: atomKey(path, state) } : { t: 'lit', v: spec };
}

export function getField(state, object, field) {
  if (object.t === 'input') {
    const path = `${object.path}.${field}`;
    return state.fields.get(path) ?? inputValue(specAt(state.run.inputs, path), path, state);
  }
  if (object.t === 'obj') {
    const entry = object.fields.find(([key]) => key === field);
    return entry === undefined ? UNDEFINED : entry[1];
  }
  return { t: 'atom', key: `${labelOf(state, object)}.${field}` };
}

function factOf(state, key) {
  return state.facts.get(key) ?? { neq: [] };
}

function admits(fact, value) {
  const equal = fact.eq === undefined || fact.eq.v === value;
  const truthy = fact.truthy === undefined || Boolean(value) === fact.truthy;
  return equal && truthy && !fact.neq.includes(value);
}

function feasible(atom, fact) {
  if (Array.isArray(atom.domain)) {
    return atom.domain.some((value) => admits(fact, value));
  }
  return fact.eq === undefined || admits(fact, fact.eq.v);
}

export function possibleValues(state, atom) {
  const fact = factOf(state, atom.key);
  if (Array.isArray(atom.domain)) {
    return atom.domain.filter((value) => admits(fact, value));
  }
  return fact.eq === undefined ? undefined : [fact.eq.v];
}

export function resolve(state, value) {
  if (value.t !== 'atom') {
    return value;
  }
  const values = possibleValues(state, value);
  if (values?.length !== 1) {
    return value;
  }
  return values[0] === undefined ? UNDEFINED : { t: 'lit', v: values[0] };
}

function decide(state, atom, patches) {
  const fact = factOf(state, atom.key);
  const merged = (patch) => ({ ...fact, ...patch, neq: [...fact.neq, ...(patch.neq ?? [])] });
  const options = [true, false].filter((outcome) =>
    feasible(atom, merged(patches[String(outcome)])),
  );
  return alternatives(state, options).map(([next, outcome]) => {
    next.facts.set(atom.key, merged(patches[String(outcome)]));
    return [next, outcome];
  });
}

function primitiveOf(value) {
  return value.t === 'undef' ? undefined : value.v;
}

function sameObject(left, right) {
  if (left.t !== right.t || left.t === 'obj') {
    return false;
  }
  return left.t === 'input' ? left.path === right.path : left.label === right.label;
}

function equality(state, left, right) {
  if (PRIMITIVE.has(left.t) && PRIMITIVE.has(right.t)) {
    return [[state, primitiveOf(left) === primitiveOf(right)]];
  }
  if (OBJECT_LIKE.has(left.t) && OBJECT_LIKE.has(right.t)) {
    return [[state, sameObject(left, right)]];
  }
  if (OBJECT_LIKE.has(left.t) || OBJECT_LIKE.has(right.t)) {
    return [[state, false]];
  }
  if (left.t === 'atom' && PRIMITIVE.has(right.t)) {
    const value = primitiveOf(right);
    return decide(state, left, { true: { eq: { v: value } }, false: { neq: [value] } });
  }
  if (left.t === 'atom' && right.t === 'atom' && left.key === right.key) {
    return [[state, true]];
  }
  return alternatives(state, [true, false]);
}

export function compare(state, { left, right, op }) {
  const resolvedLeft = resolve(state, left);
  const resolvedRight = resolve(state, right);
  const swap = PRIMITIVE.has(resolvedLeft.t) && resolvedRight.t === 'atom';
  const pairs = swap
    ? equality(state, resolvedRight, resolvedLeft)
    : equality(state, resolvedLeft, resolvedRight);
  return op === '===' ? pairs : pairs.map(([next, equal]) => [next, !equal]);
}

export function truth(state, value) {
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
    return alternatives(state, [true, false]);
  }
  return decide(state, resolved, { true: { truthy: true }, false: { truthy: false } });
}

export function labelOf(state, value) {
  const resolved = resolve(state, value);
  const labels = {
    lit: () => String(resolved.v),
    undef: () => 'undefined',
    input: () => resolved.path,
    atom: () => `?${resolved.key}`,
    opaque: () => resolved.label,
    obj: () =>
      `{ ${resolved.fields.map(([key, item]) => `${key}: ${labelOf(state, item)}`).join(', ')} }`,
    tmpl: () =>
      resolved.parts
        .map((part) => (typeof part === 'string' ? part : labelOf(state, part)))
        .join(''),
  };
  return labels[resolved.t]();
}
