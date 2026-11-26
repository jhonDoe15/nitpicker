import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  findVariable,
  resolveConstant,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { ancestorsOf, contains, nameOf } from '../typed/node-views.mts';
import { TYPE_WRAPPERS, unwrapOf } from '../typed/syntax-views.mts';

const LIST_WORDS = new Set([
  'findings',
  'results',
  'files',
  'rows',
  'entries',
  'items',
  'records',
  'issues',
  'diagnostics',
  'violations',
  'lines',
  'paths',
]);
const PASS_STEPS = new Set([
  'map',
  'filter',
  'flatMap',
  'flat',
  'sort',
  'toSorted',
  'toReversed',
  'reverse',
  'concat',
]);
const LOOP_TYPES = new Set<string>([
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.ForOfStatement,
  AST_NODE_TYPES.ForInStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
]);
const MAX_DEPTH = 6;
const FIXED_VALUES = new Set<string>([
  AST_NODE_TYPES.ObjectExpression,
  AST_NODE_TYPES.Literal,
  AST_NODE_TYPES.TemplateLiteral,
]);

export function isListWord(name: string | undefined): boolean {
  const last = /(?:^|[a-z\d_])([A-Za-z][a-z]*)$/.exec(name ?? '')?.[1] ?? '';
  return LIST_WORDS.has(last.toLowerCase());
}

export function isLoop(node: TSESTree.Node): boolean {
  return LOOP_TYPES.has(node.type);
}

function arrayDeclarator(
  context: SourceContext,
  node: TSESTree.Identifier,
): { declarator: TSESTree.VariableDeclarator; init: TSESTree.ArrayExpression } | undefined {
  const variable = findVariable(context, node, node.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  return definition?.node.type === AST_NODE_TYPES.VariableDeclarator &&
    definition.node.init?.type === AST_NODE_TYPES.ArrayExpression
    ? { declarator: definition.node, init: definition.node.init }
    : undefined;
}

function filledInLoop(
  context: SourceContext,
  node: TSESTree.Identifier,
  declarator: TSESTree.VariableDeclarator,
): boolean {
  const variable = findVariable(context, node, node.name);
  return (variable?.references ?? []).some((reference) => {
    const member = reference.identifier.parent;
    if (
      member.type !== AST_NODE_TYPES.MemberExpression ||
      nameOf(member.property) !== 'push' ||
      member.parent.type !== AST_NODE_TYPES.CallExpression
    ) {
      return false;
    }
    return ancestorsOf(member).some(
      (ancestor) => isLoop(ancestor) && !contains(ancestor, declarator),
    );
  });
}

function identifierList(context: SourceContext, node: TSESTree.Identifier, depth: number): boolean {
  const array = arrayDeclarator(context, node);
  if (array === undefined) {
    const value = resolveConstant(context, node);
    return value !== undefined && FIXED_VALUES.has(value.type)
      ? isUnboundedList(context, value, depth + 1)
      : isListWord(node.name);
  }
  return (
    filledInLoop(context, node, array.declarator) || isUnboundedList(context, array.init, depth + 1)
  );
}

function stepped(context: SourceContext, node: TSESTree.CallExpression, depth: number): boolean {
  const { callee } = node;
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const step = nameOf(callee.property) ?? '';
  return PASS_STEPS.has(step) && isUnboundedList(context, callee.object, depth + 1);
}

export function isUnboundedList(context: SourceContext, start: TSESTree.Node, depth = 0): boolean {
  const node = unwrapOf(start, TYPE_WRAPPERS);
  if (depth > MAX_DEPTH) {
    return false;
  }
  switch (node.type) {
    case AST_NODE_TYPES.Identifier:
      return identifierList(context, node, depth);
    case AST_NODE_TYPES.MemberExpression:
      return !node.computed && isListWord(nameOf(node.property));
    case AST_NODE_TYPES.CallExpression:
      return stepped(context, node, depth);
    case AST_NODE_TYPES.ArrayExpression:
      return node.elements.some(
        (element) =>
          element?.type === AST_NODE_TYPES.SpreadElement &&
          isUnboundedList(context, element.argument, depth + 1),
      );
    case AST_NODE_TYPES.ObjectExpression:
      return node.properties.some((property) =>
        property.type === AST_NODE_TYPES.SpreadElement
          ? false
          : isUnboundedList(context, property.value, depth + 1),
      );
    default:
      return false;
  }
}
