import { isOneOf, present } from '../../../../near-duplicates/tree/nodes.mts';
import type { FlowNode, FlowScope } from '../../typed/decided-types.mts';

type OpaqueScope = Omit<FlowScope, 'types'> & { readonly types?: ReadonlyMap<string, string> };

const PRIMITIVES = new Set(['int', 'long', 'short', 'byte', 'char', 'boolean', 'float', 'double']);
const NUMBERS = new Set([...PRIMITIVES, 'Int', 'Long', 'Short', 'Byte', 'Char', 'Double', 'Float']);
const SINGLE = new Set(['float', 'Float']);
const VALUE_LITERALS = new Set(['number', 'char', 'boolean', 'null']);
const SINGLETON_LITERALS = new Set(['null', 'enum']);
const ARITHMETIC = new Set(['-', '*', '/', '%', '<<', '>>', '>>>', '&', '|', '^']);
const RELATIONS = new Set(['==', '!=', '<', '<=', '>', '>=']);
const NULLABLE = /\?$/u;
const NUMBER_SUFFIX = /[lfd]$/iu;

function typeOf(node: FlowNode, scope: OpaqueScope): string | undefined {
  const text =
    node.kind === 'name' && node.value !== undefined ? scope.types?.get(node.value) : undefined;
  return text?.replace(NULLABLE, '');
}

function isPrimitiveSide(node: FlowNode, scope: OpaqueScope): boolean {
  return (
    (node.kind === 'literal' && isOneOf(VALUE_LITERALS, node.literal)) ||
    isOneOf(PRIMITIVES, typeOf(node, scope)) ||
    (node.kind === 'binary' && isOneOf(ARITHMETIC, node.value))
  );
}

function sidesOf(node: FlowNode): [FlowNode, FlowNode] {
  return [present(node.children[0]), present(node.children[1])];
}

function isNumberLiteral(node: FlowNode): boolean {
  return node.kind === 'literal' && node.literal === 'number';
}

function literalValue(node: FlowNode): number {
  return Number(present(node.value).replace(NUMBER_SUFFIX, ''));
}

function isRoundedForFloat(node: FlowNode, scope: OpaqueScope): boolean {
  const [left, right] = sidesOf(node);
  const [literal, other] = isNumberLiteral(left) ? [left, right] : [right, left];
  if (!(isNumberLiteral(literal) && isOneOf(SINGLE, typeOf(other, scope)))) {
    return false;
  }
  const value = literalValue(literal);
  return Number.isFinite(value) && Math.fround(value) !== value;
}

function isUntypedNumberTest(node: FlowNode, scope: OpaqueScope): boolean {
  const [left, right] = sidesOf(node);
  const [literal, other] = isNumberLiteral(left) ? [left, right] : [right, left];
  const type = typeOf(other, scope);
  return isNumberLiteral(literal) && type !== undefined && !NUMBERS.has(type);
}

function isIdentityTest(node: FlowNode, scope: OpaqueScope): boolean {
  const sides = node.children;
  return scope.kotlin
    ? node.value === '===' && !sides.some((side) => isOneOf(SINGLETON_LITERALS, side.literal))
    : (node.value === '==' || node.value === '!=') &&
        !sides.some(
          (side) => isPrimitiveSide(side, scope) || isOneOf(SINGLETON_LITERALS, side.literal),
        );
}

export function isOpaqueComparison(node: FlowNode, scope: OpaqueScope): boolean {
  if (!scope.references || node.kind !== 'binary' || node.equal === true) {
    return false;
  }
  if (!isOneOf(RELATIONS, node.value) && node.value !== '===' && node.value !== '!==') {
    return false;
  }
  return (
    isIdentityTest(node, scope) ||
    isRoundedForFloat(node, scope) ||
    (scope.kotlin && node.value?.length === 2 && isUntypedNumberTest(node, scope))
  );
}
