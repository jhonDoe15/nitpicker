import { chainOf } from '../../../../../shared/traversal.mjs';
import { bindPair } from '../../../../../shared/fix/recipes/extract/bijection.mjs';
import { nameHoles as sharedNameHoles } from '../../../../../shared/fix/recipes/extract/names.mjs';
import { hasModifier } from './class-shape.mjs';
import {
  codeParts,
  descendants,
  field,
  isLiteral,
  isWritten,
  javaTypeOf,
  roleOf,
  squashed,
} from './syntax.mjs';
import { deferredValue } from './holes/deferred.mjs';
import { typeStep } from './holes/type-holes.mjs';

const NARROWING_PARENTS = new Set([
  'assignment_expression',
  'return_statement',
  'array_initializer',
  'ternary_expression',
  'parenthesized_expression',
]);
const SHAPE = 'the copies are shaped differently';

function isTypeNode(node) {
  return node.type.endsWith('_type') || node.type === 'type_identifier';
}

function declaredTypeOf(parameter) {
  const dimensions = field(parameter, 'dimensions');
  const type = squashed(field(parameter, 'type'));
  return dimensions === undefined ? type : `${type}${squashed(dimensions)}`;
}

function methodParameter(node, unit) {
  const parameters = field(unit, 'parameters');
  return codeParts(parameters).find(
    (parameter) =>
      parameter.type === 'formal_parameter' && field(parameter, 'name').text === node.text,
  );
}

const CONSTANT_CONTEXTS = new Set([
  'switch_label',
  'annotation',
  'marker_annotation',
  'annotation_argument_list',
  'element_value_pair',
  'while_statement',
  'do_statement',
  'for_statement',
]);

function ancestorsWithin(node, unit) {
  const found = [];
  const pending = [node.parent];
  for (const current of pending) {
    if (current !== null && current.id !== unit.id) {
      found.push(current);
      pending.push(current.parent);
    }
  }
  return found;
}

function inConstantContext(node, unit) {
  return ancestorsWithin(node, unit).some(({ type }) => CONSTANT_CONTEXTS.has(type));
}

const BYTE_LIKE = new Set(['byte', 'short', 'Byte', 'Short']);
const NARROW = new Set([...BYTE_LIKE, 'char', 'Character']);
const PRIMITIVES = ['byte', 'short', 'char', 'int', 'long', 'float', 'double', 'boolean'];
const FOLDING_PARENTS = new Set([
  'binary_expression',
  'unary_expression',
  'parenthesized_expression',
  'ternary_expression',
]);
const CONSTANT_TYPES = new Set([...PRIMITIVES, 'String']);

function expressionRoot(node) {
  return chainOf(node, ({ parent }) => (FOLDING_PARENTS.has(parent.type) ? parent : undefined)).at(
    -1,
  );
}

function narrowsAt(parent) {
  if (parent.type === 'variable_declarator') {
    const declaration = parent.parent;
    return NARROW.has(squashed(field(declaration, 'type') ?? declaration.child(0)));
  }
  return NARROWING_PARENTS.has(parent.type);
}

function declaredNarrow(parent, types) {
  if (parent.type !== 'variable_declarator') {
    return false;
  }
  const declaration = parent.parent;
  return types.has(squashed(field(declaration, 'type') ?? declaration.child(0)));
}

function narrowsConstant(node) {
  const root = expressionRoot(node);
  if (javaTypeOf(node) === 'char') {
    return root === node ? declaredNarrow(node.parent, BYTE_LIKE) : narrowsAt(root.parent);
  }
  return javaTypeOf(node) === 'int' && (narrowsAt(node.parent) || narrowsAt(root.parent));
}

function inFinalLocal(node, unit) {
  return ancestorsWithin(node, unit).some(
    (ancestor) =>
      ancestor.type === 'local_variable_declaration' &&
      hasModifier(ancestor, 'final') &&
      CONSTANT_TYPES.has(squashed(field(ancestor, 'type'))),
  );
}

function directValue(node, side, context) {
  if (isLiteral(node)) {
    const unit = context.units[side];
    const fixed =
      narrowsConstant(node) || inConstantContext(node, unit) || inFinalLocal(node, unit);
    return fixed ? undefined : { kind: 'literal', type: javaTypeOf(node) };
  }
  if (node.type !== 'identifier' || roleOf(node) !== 'reference') {
    return undefined;
  }
  const parameter = methodParameter(node, context.units[side]);
  const written = context.written[side].has(node.text);
  return parameter === undefined || written
    ? undefined
    : { kind: 'parameter', type: declaredTypeOf(parameter) };
}

function valuesOf(pair, context) {
  const direct = pair.map((node, side) => directValue(node, side, context));
  if (!context.wide || direct.every((value) => value !== undefined)) {
    return direct;
  }
  return pair.map((node, side) => deferredValue(node, side, context));
}

function addHole(state, context, pair) {
  const values = valuesOf(pair, context);
  if (values.some((value) => value === undefined)) {
    return 'the copies differ in code that is not a plain value';
  }
  if (values[0].type !== values[1].type) {
    return 'the differing values have different types';
  }
  const key = [...pair.map((node) => node.text), values[0].type].join('\u0000');
  const hole = state.holes.get(key) ?? {
    key,
    pairKey: pair.map((node) => node.text).join('\u0000'),
    type: values[0].type,
    kind: values[0].kind === 'deferred' ? 'deferred' : 'direct',
    typeNode: values[0].typeNode,
    occurrences: [],
  };
  hole.occurrences.push({ a: pair[0], b: pair[1] });
  state.holes.set(key, hole);
  return undefined;
}

function identifierStep(pair, context, state) {
  const [x, y] = pair;
  const role = roleOf(x);
  if (role !== roleOf(y)) {
    return SHAPE;
  }
  if (role === 'member' || role === 'other') {
    return x.text === y.text ? undefined : 'the copies call or read differently named members';
  }
  const locals = [context.locals[0].has(x.text), context.locals[1].has(y.text)];
  if (locals[0] !== locals[1]) {
    return 'one copy names a local where the other names an outer value';
  }
  if (locals[0]) {
    return bindPair(state, x.text, y.text) ? undefined : 'the copies rename a local inconsistently';
  }
  return x.text === y.text ? undefined : addHole(state, context, [x, y]);
}

function childrenStep(pair, state) {
  const [x, y] = pair;
  const [left, right] = [codeParts(x), codeParts(y)];
  if (left.length !== right.length) {
    return SHAPE;
  }
  if (left.length === 0 && x.text !== y.text) {
    return 'the copies differ in a token';
  }
  state.pending.push(...left.map((child, index) => [child, right[index]]));
  return undefined;
}

const CALLS = { method_invocation: 'name', field_access: 'field' };

function isDifferentMember([x, y]) {
  const member = CALLS[x.type];
  return (
    x.type === y.type && member !== undefined && field(x, member).text !== field(y, member).text
  );
}

function step(pair, context, state) {
  const [x, y] = pair;
  if (context.wide && isTypeNode(x) && isTypeNode(y)) {
    return typeStep(state, x, y);
  }
  if (x.type !== y.type || (context.wide && isDifferentMember(pair))) {
    return addHole(state, context, pair);
  }
  if (isTypeNode(x)) {
    return squashed(x) === squashed(y) ? undefined : 'the copies use different types';
  }
  if (isLiteral(x)) {
    return x.text === y.text ? undefined : addHole(state, context, pair);
  }
  if (x.type === 'identifier') {
    return identifierStep(pair, context, state);
  }
  return childrenStep(pair, state);
}

export function writtenNames(unit) {
  return new Set(
    descendants(unit)
      .filter((node) => node.type === 'identifier' && isWritten(node))
      .map(({ text }) => text),
  );
}

export function alignUnits(units, pairs, context) {
  const state = {
    forward: new Map(),
    backward: new Map(),
    holes: new Map(),
    typeSites: new Set(),
    pending: [...pairs],
  };
  const full = { ...context, units };
  for (const pair of state.pending) {
    const problem = step(pair, full, state);
    if (problem !== undefined) {
      return { declined: problem };
    }
  }
  return {
    holes: [...state.holes.values()],
    bindings: [...state.forward],
    typeSites: state.typeSites.size,
  };
}

function flowName(node) {
  const declarator = node.parent;
  if (declarator.type === 'variable_declarator') {
    return field(declarator, 'name').text;
  }
  return node.type === 'identifier' ? node.text : undefined;
}

function stemOf(hole) {
  const stem = flowName(hole.occurrences[0].a);
  return hole.kind === 'deferred' ? `${stem ?? 'value'}Supplier` : stem;
}

export function nameHoles(holes, taken) {
  return sharedNameHoles(holes, taken, stemOf);
}
