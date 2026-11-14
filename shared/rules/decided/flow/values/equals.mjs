import { nodesOf, rebuild } from '../../../../near-duplicates/tree/nodes.mjs';

const OBJECTS = 'java.util.Objects';
const EXACT_BOXES = new Map([
  ['Integer', /^(?:0x[\da-f]+|0b[01]+|\d+)$/iu],
  ['Long', /^(?:0x[\da-f]+|0b[01]+|\d+)l$/iu],
]);

function isValueLiteral(node) {
  return (
    node.kind === 'literal' &&
    (node.literal === 'string' || node.literal === 'boolean' || node.literal === 'enum')
  );
}

function isBoxed(literal, other, scope) {
  const type = other.kind === 'name' ? scope.types.get(other.value) : undefined;
  if (literal.kind !== 'literal') {
    return false;
  }
  if (type === 'Character') {
    return literal.literal === 'char';
  }
  return literal.literal === 'number' && EXACT_BOXES.get(type)?.test(literal.value) === true;
}

function isValueEquality([left, right], scope) {
  return (
    isValueLiteral(left) ||
    isValueLiteral(right) ||
    isBoxed(left, right, scope) ||
    isBoxed(right, left, scope)
  );
}

function equalsSides(call) {
  const [callee, ...arguments_] = call.children;
  if (call.kind !== 'call' || callee.kind !== 'member' || callee.value !== 'equals') {
    return undefined;
  }
  const [owner] = callee.children;
  if (owner?.kind === 'name' && owner.binding === 'free' && owner.value === OBJECTS) {
    return arguments_.length === 2 ? arguments_ : undefined;
  }
  return arguments_.length === 1 && owner !== undefined ? [owner, arguments_[0]] : undefined;
}

function equalityOf(call, scope) {
  const sides = equalsSides(call);
  if (sides === undefined || !isValueEquality(sides, scope)) {
    return undefined;
  }
  return { ...call, kind: 'binary', value: '==', children: sides };
}

function enumOf(node, scope) {
  const [owner] = node.children;
  const constant = owner?.kind === 'name' ? `${owner.text}.${node.value}` : undefined;
  return node.kind === 'member' && scope.enums.has(constant)
    ? { kind: 'literal', literal: 'enum', value: constant, text: constant, children: [] }
    : undefined;
}

function isRewritable(node) {
  return node.kind === 'member';
}

/**
 * `node` with `x.equals(y)` and `Objects.equals(x, y)` read as `x == y` where one side is a string,
 * a boolean, an enum constant or a boxed literal of the other side's type, and enum constants
 * named by their type read as one value each.
 */
export function withValueEquality(node, scope) {
  if (!nodesOf(node).some(isRewritable)) {
    return node;
  }
  return rebuild(node, (current, children) => {
    const built = { ...current, children };
    return enumOf(built, scope) ?? equalityOf(built, scope) ?? built;
  });
}
