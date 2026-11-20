import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { orderedOperandsOf } from '../typed/syntax-views.mts';
import {
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../analysis/constant-resolution.mts';

const DELIMITER = /^[^\p{L}\p{N}\s]{1,2}$/u;
const MIN_PARTS = 2;

function isDelimiter(node: TSESTree.Node): boolean {
  return DELIMITER.test(stringValue(node) ?? '');
}

function templateParts(node: TSESTree.TemplateLiteral): readonly TSESTree.Node[] | undefined {
  const separated = node.quasis.some(
    (quasi, index) =>
      index > 0 && index < node.quasis.length - 1 && DELIMITER.test(quasi.value.cooked ?? ''),
  );
  return separated && node.expressions.length >= MIN_PARTS ? node.expressions : undefined;
}

function joinParts(node: TSESTree.CallExpression): readonly TSESTree.Node[] | undefined {
  const { callee } = node;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.computed ||
    callee.property.type !== AST_NODE_TYPES.Identifier ||
    callee.property.name !== 'join' ||
    callee.object.type !== AST_NODE_TYPES.ArrayExpression
  ) {
    return undefined;
  }
  const [separator] = node.arguments;
  const elements = callee.object.elements;
  return elements.length >= MIN_PARTS &&
    elements.every(
      (element) => element !== null && element.type !== AST_NODE_TYPES.SpreadElement,
    ) &&
    (separator === undefined || isDelimiter(separator))
    ? elements
    : undefined;
}

function concatenatedParts(node: TSESTree.BinaryExpression): readonly TSESTree.Node[] | undefined {
  const operands = orderedOperandsOf(node, '+');
  const parts = operands.filter((operand) => stringValue(operand) === undefined);
  const separated = operands.some(
    (operand, index) =>
      isDelimiter(operand) &&
      index > 0 &&
      index < operands.length - 1 &&
      stringValue(operands[index - 1]) === undefined &&
      stringValue(operands[index + 1]) === undefined,
  );
  return separated && parts.length >= MIN_PARTS ? parts : undefined;
}

export function compositeParts(
  context: SourceContext,
  node: TSESTree.Node,
): readonly TSESTree.Node[] | undefined {
  const value = resolveConstant(context, node);
  if (value?.type === AST_NODE_TYPES.TemplateLiteral) {
    return templateParts(value);
  }
  if (value?.type === AST_NODE_TYPES.CallExpression) {
    return joinParts(value);
  }
  return value?.type === AST_NODE_TYPES.BinaryExpression && value.operator === '+'
    ? concatenatedParts(value)
    : undefined;
}
