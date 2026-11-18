import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  findVariable,
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { nameText, wordsOf } from './names.mts';

const BOUNDARY_CHARACTERS = '/\\.:-_@?#=&';
const SEPARATOR_WORDS = new Set(['sep', 'separator', 'slash', 'delimiter']);
const MAX_DEPTH = 6;

function endsWithBoundaryCharacter(text: string): boolean {
  return text === '' || BOUNDARY_CHARACTERS.includes(text.at(-1) ?? '');
}

function namesSeparator(node: TSESTree.Node): boolean {
  const name = nameText(node);
  return name !== undefined && wordsOf(name).some((word) => SEPARATOR_WORDS.has(word));
}

function templateEnds(
  context: SourceContext,
  node: TSESTree.TemplateLiteral,
  depth: number,
): boolean {
  const last = node.quasis.at(-1)?.value.cooked ?? '';
  const expression = node.expressions.at(-1);
  if (last !== '') {
    return endsWithBoundaryCharacter(last);
  }
  return expression === undefined || endsWithBoundary(context, expression, depth + 1);
}

function callEnds(context: SourceContext, node: TSESTree.CallExpression, depth: number): boolean {
  if (namesSeparator(node.callee)) {
    return true;
  }
  const name = nameText(node.callee);
  const last = node.arguments.at(-1);
  return (
    (name === 'concat' || name === 'join' || name === 'resolve') &&
    last !== undefined &&
    endsWithBoundary(context, last, depth + 1)
  );
}

function assignedEnds(context: SourceContext, node: TSESTree.Identifier, depth: number): boolean {
  const references = findVariable(context, node, node.name)?.references ?? [];
  return references.some(
    (reference) =>
      reference.writeExpr != null && endsWithBoundary(context, reference.writeExpr, depth + 1),
  );
}

function compoundEnds(
  context: SourceContext,
  node: TSESTree.Node,
  depth: number,
): boolean | undefined {
  const next = depth + 1;
  if (node.type === AST_NODE_TYPES.BinaryExpression && node.operator === '+') {
    return endsWithBoundary(context, node.right, next);
  }
  if (node.type === AST_NODE_TYPES.ConditionalExpression) {
    return (
      endsWithBoundary(context, node.consequent, next) ||
      endsWithBoundary(context, node.alternate, next)
    );
  }
  return node.type === AST_NODE_TYPES.LogicalExpression
    ? endsWithBoundary(context, node.left, next) || endsWithBoundary(context, node.right, next)
    : undefined;
}

export function endsWithBoundary(context: SourceContext, node: TSESTree.Node, depth = 0): boolean {
  const resolved = resolveConstant(context, node) ?? node;
  const text = stringValue(resolved);
  if (depth > MAX_DEPTH) {
    return true;
  }
  if (text !== undefined) {
    return endsWithBoundaryCharacter(text);
  }
  if (resolved.type === AST_NODE_TYPES.TemplateLiteral) {
    return templateEnds(context, resolved, depth);
  }
  if (resolved.type === AST_NODE_TYPES.CallExpression) {
    return callEnds(context, resolved, depth);
  }
  return (
    compoundEnds(context, resolved, depth) ??
    (namesSeparator(resolved) ||
      (resolved.type === AST_NODE_TYPES.Identifier && assignedEnds(context, resolved, depth)))
  );
}

export function startsWithBoundary(context: SourceContext, node: TSESTree.Node): boolean {
  const resolved = resolveConstant(context, node) ?? node;
  const text = stringValue(resolved);
  if (text !== undefined) {
    return text === '' || '.@/'.includes(text[0] ?? '');
  }
  if (resolved.type === AST_NODE_TYPES.TemplateLiteral) {
    return (
      (resolved.quasis[0]?.value.cooked ?? '') !== '' &&
      '.@/'.includes(resolved.quasis[0]?.value.cooked?.[0] ?? '')
    );
  }
  if (resolved.type === AST_NODE_TYPES.BinaryExpression && resolved.operator === '+') {
    return startsWithBoundary(context, resolved.left);
  }
  return false;
}
