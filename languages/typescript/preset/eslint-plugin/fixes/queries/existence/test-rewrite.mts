import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { unwrapped } from '../../../rules/security/security-values.mts';

export type Polarity = 'present' | 'absent';

const PRESENT_OPERATORS = new Set(['!==', '!=']);
const ABSENT_OPERATORS = new Set(['===', '==']);
const MIRRORED = new Map([
  ['>', '<'],
  ['<', '>'],
  ['>=', '<='],
  ['<=', '>='],
]);
const COUNT_POLARITY = new Map<string, readonly [Polarity, number]>([
  ['>', ['present', 0]],
  ['>=', ['present', 1]],
  ['!==', ['present', 0]],
  ['!=', ['present', 0]],
  ['<', ['absent', 1]],
  ['<=', ['absent', 0]],
  ['===', ['absent', 0]],
  ['==', ['absent', 0]],
]);
function sideOf(binary: TSESTree.BinaryExpression, operand: TSESTree.Node): TSESTree.Node {
  return binary.left === operand ? binary.right : binary.left;
}

export function nullPolarity(
  binary: TSESTree.BinaryExpression,
  operand: TSESTree.Node,
): Polarity | undefined {
  const other = unwrapped(sideOf(binary, operand));
  const strict = binary.operator.length === 3;
  const isNull = other.type === AST_NODE_TYPES.Literal && other.raw === 'null';
  const isUndefined = other.type === AST_NODE_TYPES.Identifier && other.name === 'undefined';
  if (!isNull && !(isUndefined && !strict)) {
    return undefined;
  }
  if (PRESENT_OPERATORS.has(binary.operator)) {
    return 'present';
  }
  return ABSENT_OPERATORS.has(binary.operator) ? 'absent' : undefined;
}

export function countPolarity(
  binary: TSESTree.BinaryExpression,
  operand: TSESTree.Node,
): Polarity | undefined {
  const other = unwrapped(sideOf(binary, operand));
  const operator =
    binary.left === operand ? binary.operator : (MIRRORED.get(binary.operator) ?? binary.operator);
  const entry = COUNT_POLARITY.get(operator);
  const literal = other.type === AST_NODE_TYPES.Literal ? other.value : undefined;
  return entry !== undefined && literal === entry[1] ? entry[0] : undefined;
}

export function negated(text: string): string {
  return `!${text}`;
}
