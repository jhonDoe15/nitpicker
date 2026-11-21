import { nodesOf, present, rebuild } from '../../../../near-duplicates/tree/nodes.mts';
import type { FlowNode, FlowScope } from '../../typed/decided-types.mts';

type Sides = readonly [FlowNode, FlowNode];

const OBJECTS = 'java.util.Objects';
const EXACT_BOXES = new Map([
  ['Integer', /^(?:0x[\da-f]+|0b[01]+|\d+)$/iu],
  ['Long', /^(?:0x[\da-f]+|0b[01]+|\d+)l$/iu],
]);

function isValueLiteral(node: FlowNode): boolean {
  return (
    node.kind === 'literal' &&
    (node.literal === 'string' || node.literal === 'boolean' || node.literal === 'enum')
  );
}

function isBoxed(literal: FlowNode, other: FlowNode, scope: FlowScope): boolean {
  const type =
    other.kind === 'name' && other.value !== undefined ? scope.types.get(other.value) : undefined;
  if (literal.kind !== 'literal') {
    return false;
  }
  if (type === 'Character') {
    return literal.literal === 'char';
  }
  const exact = type === undefined ? undefined : EXACT_BOXES.get(type);
  return literal.literal === 'number' && exact?.test(literal.value ?? '') === true;
}

function isValueEquality([left, right]: Sides, scope: FlowScope): boolean {
  return (
    isValueLiteral(left) ||
    isValueLiteral(right) ||
    isBoxed(left, right, scope) ||
    isBoxed(right, left, scope)
  );
}

function equalsSides(call: FlowNode): Sides | undefined {
  const [callee, ...passed] = call.children;
  if (call.kind !== 'call' || callee?.kind !== 'member' || callee.value !== 'equals') {
    return undefined;
  }
  const [owner] = callee.children;
  if (owner?.kind === 'name' && owner.binding === 'free' && owner.value === OBJECTS) {
    return passed.length === 2 ? [present(passed[0]), present(passed[1])] : undefined;
  }
  return passed.length === 1 && owner !== undefined ? [owner, present(passed[0])] : undefined;
}

function equalityOf(call: FlowNode, scope: FlowScope): FlowNode | undefined {
  const sides = equalsSides(call);
  if (sides === undefined || !isValueEquality(sides, scope)) {
    return undefined;
  }
  return { ...call, kind: 'binary', value: '==', equal: true, children: sides };
}

function enumOf(node: FlowNode, scope: FlowScope): FlowNode | undefined {
  const [owner] = node.children;
  const constant =
    owner?.kind === 'name' ? `${String(owner.text)}.${String(node.value)}` : undefined;
  return node.kind === 'member' && constant !== undefined && scope.enums.has(constant)
    ? { kind: 'literal', literal: 'enum', value: constant, text: constant, children: [] }
    : undefined;
}

function isRewritable(node: FlowNode): boolean {
  return node.kind === 'member';
}

export function withValueEquality(node: FlowNode, scope: FlowScope): FlowNode {
  if (!nodesOf(node).some(isRewritable)) {
    return node;
  }
  return rebuild(node, (current: FlowNode, children: FlowNode[]): FlowNode => {
    const built = { ...current, children };
    return enumOf(built, scope) ?? equalityOf(built, scope) ?? built;
  });
}
