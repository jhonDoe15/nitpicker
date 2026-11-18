import type { Node } from 'web-tree-sitter';
import type {
  AlignContext,
  AlignHole,
  AlignState,
  Aligned,
  Attempt,
  Direct,
  FullContext,
  Pair,
} from '../extract-types.mts';
import { bindPair, chainOf } from '../jvm-views.mts';
import { hasModifier } from './class-shape.mts';
import {
  codeParts,
  descendants,
  field,
  isLiteral,
  isWritten,
  javaTypeOf,
  parentOf,
  present,
  required,
  roleOf,
  squashed,
} from './syntax.mts';
import { fieldStep } from './cross/fields.mts';
import { deferredValue } from './holes/deferred.mts';
import { typeStep } from './holes/type-holes.mts';
import { appendAll } from '../../../../../shared/lists/lists.mts';

const NARROWING_PARENTS = new Set([
  'assignment_expression',
  'return_statement',
  'array_initializer',
  'ternary_expression',
  'parenthesized_expression',
]);
const SHAPE = 'the copies are shaped differently';

function isTypeNode(node: Node): boolean {
  return (
    node.type.endsWith('_type') ||
    node.type === 'type_identifier' ||
    node.type === 'scoped_type_identifier'
  );
}

function declaredTypeOf(parameter: Node): string {
  const dimensions = field(parameter, 'dimensions');
  const type = squashed(required(parameter, 'type'));
  return dimensions === undefined ? type : `${type}${squashed(dimensions)}`;
}

function methodParameter(node: Node, unit: Node): Node | undefined {
  const parameters = required(unit, 'parameters');
  return codeParts(parameters).find(
    (parameter) =>
      parameter.type === 'formal_parameter' && required(parameter, 'name').text === node.text,
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

function ancestorsWithin(node: Node, unit: Node): Node[] {
  const found: Node[] = [];
  const pending = [node.parent];
  for (const current of pending) {
    if (current !== null && current.id !== unit.id) {
      found.push(current);
      pending.push(current.parent);
    }
  }
  return found;
}

function inConstantContext(node: Node, unit: Node): boolean {
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

function expressionRoot(node: Node): Node {
  return present(
    chainOf(node, (current) => {
      const parent = parentOf(current);
      return FOLDING_PARENTS.has(parent.type) ? parent : undefined;
    }).at(-1),
  );
}

function narrowsAt(parent: Node): boolean {
  if (parent.type === 'variable_declarator') {
    const declaration = parentOf(parent);
    return NARROW.has(squashed(present(field(declaration, 'type') ?? declaration.child(0))));
  }
  return NARROWING_PARENTS.has(parent.type);
}

function declaredNarrow(parent: Node, types: ReadonlySet<string>): boolean {
  if (parent.type !== 'variable_declarator') {
    return false;
  }
  const declaration = parentOf(parent);
  return types.has(squashed(present(field(declaration, 'type') ?? declaration.child(0))));
}

function narrowsConstant(node: Node): boolean {
  const root = expressionRoot(node);
  if (javaTypeOf(node) === 'char') {
    return root === node ? declaredNarrow(parentOf(node), BYTE_LIKE) : narrowsAt(parentOf(root));
  }
  return javaTypeOf(node) === 'int' && (narrowsAt(parentOf(node)) || narrowsAt(parentOf(root)));
}

function inFinalLocal(node: Node, unit: Node): boolean {
  return ancestorsWithin(node, unit).some(
    (ancestor) =>
      ancestor.type === 'local_variable_declaration' &&
      hasModifier(ancestor, 'final') &&
      CONSTANT_TYPES.has(squashed(required(ancestor, 'type'))),
  );
}

function directValue(node: Node, side: number, context: FullContext): Direct | undefined {
  if (isLiteral(node)) {
    const unit = present(context.units[side]);
    const fixed =
      narrowsConstant(node) || inConstantContext(node, unit) || inFinalLocal(node, unit);
    return fixed ? undefined : { kind: 'literal', type: present(javaTypeOf(node)) };
  }
  if (node.type !== 'identifier' || roleOf(node) !== 'reference') {
    return undefined;
  }
  const parameter = methodParameter(node, present(context.units[side]));
  const written = present(context.written[side]).has(node.text);
  return parameter === undefined || written
    ? undefined
    : { kind: 'parameter', type: declaredTypeOf(parameter) };
}

function valuesOf(pair: Pair, context: FullContext): (Direct | undefined)[] {
  const direct = pair.map((node, side) => directValue(node, side, context));
  if (!context.wide || direct.every((value) => value !== undefined)) {
    return direct;
  }
  return pair.map((node, side) => deferredValue(node, side, context));
}

function addHole(state: AlignState, context: FullContext, pair: Pair): string | undefined {
  const [first, second] = valuesOf(pair, context);
  if (first === undefined || second === undefined) {
    return 'the copies differ in code that is not a plain value';
  }
  if (first.type !== second.type) {
    return 'the differing values have different types';
  }
  const key = [...pair.map((node) => node.text), first.type].join('\u0000');
  const hole: AlignHole = state.holes.get(key) ?? {
    key,
    pairKey: pair.map((node) => node.text).join('\u0000'),
    type: first.type,
    kind: first.kind === 'deferred' ? 'deferred' : 'direct',
    typeNode: first.typeNode,
    occurrences: [],
  };
  hole.occurrences.push({ a: pair[0], b: pair[1] });
  state.holes.set(key, hole);
  return undefined;
}

function identifierStep(pair: Pair, context: FullContext, state: AlignState): string | undefined {
  const [x, y] = pair;
  const role = roleOf(x);
  if (role !== roleOf(y)) {
    return SHAPE;
  }
  if (role === 'member' || role === 'other') {
    return x.text === y.text ? undefined : 'the copies call or read differently named members';
  }
  const locals = [present(context.locals[0]).has(x.text), present(context.locals[1]).has(y.text)];
  if (locals[0] !== locals[1]) {
    return 'one copy names a local where the other names an outer value';
  }
  if (locals[0]) {
    return bindPair(state, x.text, y.text) ? undefined : 'the copies rename a local inconsistently';
  }
  return x.text === y.text ? fieldStep([x, y], context, state) : addHole(state, context, [x, y]);
}

function childrenStep(pair: Pair, state: AlignState): string | undefined {
  const [x, y] = pair;
  const [left, right] = [codeParts(x), codeParts(y)];
  if (left.length !== right.length) {
    return SHAPE;
  }
  if (left.length === 0 && x.text !== y.text) {
    return 'the copies differ in a token';
  }
  appendAll(
    state.pending,
    left.map((child, index): Pair => [child, present(right[index])]),
  );
  return undefined;
}

const CALLS: Readonly<Record<string, string>> = {
  method_invocation: 'name',
  field_access: 'field',
};

function isDifferentMember([x, y]: Pair): boolean {
  const member = CALLS[x.type];
  return (
    x.type === y.type &&
    member !== undefined &&
    required(x, member).text !== required(y, member).text
  );
}

function step(pair: Pair, context: FullContext, state: AlignState): string | undefined {
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

export function writtenNames(unit: Node): Set<string> {
  return new Set(
    descendants(unit)
      .filter((node) => node.type === 'identifier' && isWritten(node))
      .map(({ text }) => text),
  );
}

export function alignUnits(
  units: readonly Node[],
  pairs: readonly Pair[],
  context: AlignContext,
): Attempt<Aligned> {
  const state: AlignState = {
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
