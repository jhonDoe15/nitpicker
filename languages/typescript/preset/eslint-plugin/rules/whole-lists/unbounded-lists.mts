import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  findVariable,
  referencesOf,
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
  return referencesOf(context, node, node.name).some((reference) => {
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

type Expansion = { readonly unbounded: boolean; readonly next: TSESTree.Node[] };

type Pending = { readonly node: TSESTree.Node; readonly depth: number };

const NO_EXPANSION: Expansion = { unbounded: false, next: [] };

function identifierExpansion(context: SourceContext, node: TSESTree.Identifier): Expansion {
  const array = arrayDeclarator(context, node);
  if (array !== undefined) {
    return { unbounded: filledInLoop(context, node, array.declarator), next: [array.init] };
  }
  const value = resolveConstant(context, node);
  if (value !== undefined && FIXED_VALUES.has(value.type)) {
    return { unbounded: false, next: [value] };
  }
  return { unbounded: isListWord(node.name), next: [] };
}

function callExpansion(node: TSESTree.CallExpression): Expansion {
  const { callee } = node;
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return NO_EXPANSION;
  }
  return PASS_STEPS.has(nameOf(callee.property) ?? '')
    ? { unbounded: false, next: [callee.object] }
    : NO_EXPANSION;
}

function spreadArguments(node: TSESTree.ArrayExpression): TSESTree.Node[] {
  return node.elements.flatMap((element) =>
    element?.type === AST_NODE_TYPES.SpreadElement ? [element.argument] : [],
  );
}

function propertyValues(node: TSESTree.ObjectExpression): TSESTree.Node[] {
  return node.properties.flatMap((property) =>
    property.type === AST_NODE_TYPES.SpreadElement ? [] : [property.value],
  );
}

function expansionOf(context: SourceContext, node: TSESTree.Node): Expansion {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return identifierExpansion(context, node);
  }
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    return { unbounded: !node.computed && isListWord(nameOf(node.property)), next: [] };
  }
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return callExpansion(node);
  }
  if (node.type === AST_NODE_TYPES.ArrayExpression) {
    return { unbounded: false, next: spreadArguments(node) };
  }
  if (node.type === AST_NODE_TYPES.ObjectExpression) {
    return { unbounded: false, next: propertyValues(node) };
  }
  return NO_EXPANSION;
}

export function isUnboundedList(context: SourceContext, start: TSESTree.Node): boolean {
  const pending: Pending[] = [{ node: start, depth: 0 }];
  const expanded = new Set<TSESTree.Node>();
  for (const { node, depth } of pending) {
    if (depth > MAX_DEPTH || expanded.has(node)) {
      continue;
    }
    expanded.add(node);
    const { unbounded, next } = expansionOf(context, unwrapOf(node, TYPE_WRAPPERS));
    if (unbounded) {
      return true;
    }
    for (const child of next) {
      pending.push({ node: child, depth: depth + 1 });
    }
  }
  return false;
}
