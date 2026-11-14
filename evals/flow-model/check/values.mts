import { childSpec, domainOf, isTree } from '../model/inputs.mts';
import type { Inputs, SpecNode } from '../model/contract-types.mts';
import type {
  AtomValue,
  Fact,
  ObjectLikeValue,
  PrimitiveValue,
  State,
  Value,
} from '../model/run-types.mts';
import type { Primitive } from '../model/syntax-types.mts';
import { UNDEFINED } from './state.mts';

export function isObjectLike(value: Value): value is ObjectLikeValue {
  return value.t === 'input' || value.t === 'opaque' || value.t === 'obj';
}

export function isPrimitive(value: Value): value is PrimitiveValue {
  return value.t === 'lit' || value.t === 'undef';
}

function specAt(inputs: Inputs, path: string): SpecNode {
  let spec: SpecNode = inputs;
  for (const part of path.split('.')) {
    spec = childSpec(spec, part);
  }
  return spec;
}

function atomKey(path: string, state: State): string {
  return state.epoch === 0 ? path : `${path}@${String(state.epoch)}`;
}

function inputValue(spec: SpecNode, path: string, state: State): Value {
  if (spec === 'effects' || spec === 'object') {
    return { t: 'input', path, ...(spec === 'effects' ? { effects: true as const } : {}) };
  }
  const domain = domainOf(spec);
  if (isTree(spec) && domain === undefined) {
    return { t: 'input', path };
  }
  if (spec === undefined || state.mutated) {
    return { t: 'atom', key: atomKey(path, state) };
  }
  if (domain !== undefined) {
    return { t: 'atom', key: atomKey(path, state), domain };
  }
  if (typeof spec === 'object') {
    throw new Error(`flow-model: input ${path} must be a value, an object or { oneOf: [...] }`);
  }
  return { t: 'lit', v: spec };
}

export function inputOf(state: State, name: string): Value {
  return inputValue(specAt(state.run.inputs, name), name, state);
}

function objectField(
  state: State,
  object: Extract<Value, { t: 'obj' }>,
  field: string | undefined,
): Value {
  const path = `${object.id}.${String(field)}`;
  const known = state.fields.get(path);
  if (known !== undefined) {
    return known;
  }
  if (object.epoch !== state.epoch) {
    return { t: 'atom', key: atomKey(path, state) };
  }
  const entry = object.fields.find(([key]) => key === field);
  if (entry === undefined && Object.hasOwn(Object.prototype, String(field))) {
    return { t: 'atom', key: `${atomKey(path, state)}#inherited` };
  }
  return entry === undefined ? UNDEFINED : entry[1];
}

export function getField(state: State, object: Value, field: string | undefined): Value {
  if (object.t === 'input') {
    const path = `${object.path}.${String(field)}`;
    return state.fields.get(path) ?? inputOf(state, path);
  }
  if (object.t === 'obj') {
    return objectField(state, object, field);
  }
  return { t: 'atom', key: `${labelOf(state, object)}.${String(field)}` };
}

export function factOf(state: State, key: string): Fact {
  return state.facts.get(key) ?? { neq: [] };
}

function admits(fact: Fact, value: Primitive): boolean {
  const equal = fact.eq === undefined || fact.eq.v === value;
  const truthy = fact.truthy === undefined || Boolean(value) === fact.truthy;
  return equal && truthy && !fact.neq.includes(value);
}

export function feasible(atom: AtomValue, fact: Fact): boolean {
  if (atom.domain !== undefined) {
    return atom.domain.some((value) => admits(fact, value));
  }
  return fact.eq === undefined || admits(fact, fact.eq.v);
}

export function domainValues(
  state: State,
  atom: AtomValue,
  domain: readonly Primitive[],
): Primitive[] {
  const fact = factOf(state, atom.key);
  return domain.filter((value) => admits(fact, value));
}

export function possibleValues(state: State, atom: AtomValue): Primitive[] | undefined {
  if (atom.domain !== undefined) {
    return domainValues(state, atom, atom.domain);
  }
  const fact = factOf(state, atom.key);
  return fact.eq === undefined ? undefined : [fact.eq.v];
}

export function primitive(value: Primitive): Value {
  return value === undefined ? UNDEFINED : { t: 'lit', v: value };
}

export function primitiveOf(value: PrimitiveValue): Primitive {
  return value.t === 'undef' ? undefined : value.v;
}

export function resolve(state: State, value: Value): Value {
  if (value.t !== 'atom') {
    return value;
  }
  const values = possibleValues(state, value);
  const [only] = values ?? [];
  return values?.length === 1 ? primitive(only) : value;
}

function leafLabel(value: Value): string {
  switch (value.t) {
    case 'lit':
      return String(value.v);
    case 'undef':
      return 'undefined';
    case 'input':
      return value.path;
    case 'atom':
      return `?${value.key}`;
    case 'opaque':
      return value.label;
    case 'obj':
      return value.id;
    case 'tmpl':
      return '`...`';
  }
}

function partsLabel(state: State, parts: readonly (string | Value)[]): string {
  return parts
    .map((part) => (typeof part === 'string' ? part : leafLabel(resolve(state, part))))
    .join('');
}

export function labelOf(state: State, value: Value): string {
  const resolved = resolve(state, value);
  if (resolved.t === 'obj') {
    const fields = resolved.fields.map(
      ([key, item]) => `${key}: ${leafLabel(resolve(state, item))}`,
    );
    return `{ ${fields.join(', ')} }`;
  }
  return resolved.t === 'tmpl' ? partsLabel(state, resolved.parts) : leafLabel(resolved);
}

function concrete(state: State, value: Value): boolean {
  const resolved = resolve(state, value);
  return isPrimitive(resolved) || resolved.t === 'input' || resolved.t === 'opaque';
}

export function identityOf(state: State, value: Value): string | undefined {
  const resolved = resolve(state, value);
  if (resolved.t === 'tmpl') {
    const known = resolved.parts.every(
      (part) => typeof part === 'string' || isPrimitive(resolve(state, part)),
    );
    return known ? partsLabel(state, resolved.parts) : undefined;
  }
  return concrete(state, resolved) ? leafLabel(resolved) : undefined;
}
