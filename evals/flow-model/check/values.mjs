import { isRecord } from '../report/canonical.mjs';
import { UNDEFINED } from './state.mjs';

export const OBJECT_LIKE = new Set(['input', 'opaque', 'obj']);
export const PRIMITIVE = new Set(['lit', 'undef']);

function specAt(inputs, path) {
  let spec = inputs;
  for (const part of path.split('.')) {
    spec = isRecord(spec) && Object.hasOwn(spec, part) ? spec[part] : undefined;
  }
  return spec;
}

function atomKey(path, state) {
  return state.epoch === 0 ? path : `${path}@${String(state.epoch)}`;
}

function inputValue(spec, path, state) {
  if (spec === 'effects' || spec === 'object') {
    return { t: 'input', path, ...(spec === 'effects' ? { effects: true } : {}) };
  }
  if (isRecord(spec) && !Array.isArray(spec.oneOf)) {
    return { t: 'input', path };
  }
  if (spec === undefined || state.mutated) {
    return { t: 'atom', key: atomKey(path, state) };
  }
  return isRecord(spec)
    ? { t: 'atom', key: atomKey(path, state), domain: spec.oneOf }
    : { t: 'lit', v: spec };
}

export function inputOf(state, name) {
  return inputValue(specAt(state.run.inputs, name), name, state);
}

function objectField(state, object, field) {
  const path = `${object.id}.${field}`;
  if (state.fields.has(path)) {
    return state.fields.get(path);
  }
  if (object.epoch !== state.epoch) {
    return { t: 'atom', key: atomKey(path, state) };
  }
  const entry = object.fields.find(([key]) => key === field);
  if (entry === undefined && Object.hasOwn(Object.prototype, field)) {
    return { t: 'atom', key: `${atomKey(path, state)}#inherited` };
  }
  return entry === undefined ? UNDEFINED : entry[1];
}

export function getField(state, object, field) {
  if (object.t === 'input') {
    const path = `${object.path}.${field}`;
    return state.fields.get(path) ?? inputOf(state, path);
  }
  if (object.t === 'obj') {
    return objectField(state, object, field);
  }
  return { t: 'atom', key: `${labelOf(state, object)}.${field}` };
}

export function factOf(state, key) {
  return state.facts.get(key) ?? { neq: [] };
}

function admits(fact, value) {
  const equal = fact.eq === undefined || fact.eq.v === value;
  const truthy = fact.truthy === undefined || Boolean(value) === fact.truthy;
  return equal && truthy && !fact.neq.includes(value);
}

export function feasible(atom, fact) {
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

export function primitive(value) {
  return value === undefined ? UNDEFINED : { t: 'lit', v: value };
}

export function primitiveOf(value) {
  return value.t === 'undef' ? undefined : value.v;
}

export function resolve(state, value) {
  if (value.t !== 'atom') {
    return value;
  }
  const values = possibleValues(state, value);
  return values?.length === 1 ? primitive(values[0]) : value;
}

function leafLabel(value) {
  const labels = {
    lit: () => String(value.v),
    undef: () => 'undefined',
    input: () => value.path,
    atom: () => `?${value.key}`,
    opaque: () => value.label,
    obj: () => value.id,
    tmpl: () => '`...`',
  };
  return labels[value.t]();
}

function partsLabel(state, parts) {
  return parts
    .map((part) => (typeof part === 'string' ? part : leafLabel(resolve(state, part))))
    .join('');
}

export function labelOf(state, value) {
  const resolved = resolve(state, value);
  if (resolved.t === 'obj') {
    const fields = resolved.fields.map(
      ([key, item]) => `${key}: ${leafLabel(resolve(state, item))}`,
    );
    return `{ ${fields.join(', ')} }`;
  }
  return resolved.t === 'tmpl' ? partsLabel(state, resolved.parts) : leafLabel(resolved);
}

function concrete(state, value) {
  const resolved = resolve(state, value);
  return PRIMITIVE.has(resolved.t) || resolved.t === 'input' || resolved.t === 'opaque';
}

export function identityOf(state, value) {
  const resolved = resolve(state, value);
  if (resolved.t === 'tmpl') {
    const known = resolved.parts.every(
      (part) => typeof part === 'string' || PRIMITIVE.has(resolve(state, part).t),
    );
    return known ? partsLabel(state, resolved.parts) : undefined;
  }
  return concrete(state, resolved) ? leafLabel(resolved) : undefined;
}
