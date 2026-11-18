import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { depthFirst, nodeChildren, type SourceCode } from '../typed/node-views.mts';
import type { FunctionNode } from '../typed/syntax-views.mts';

export type Variable = TSESLint.Scope.Variable;
export type { FunctionNode };

const FUNCTION_TYPES = new Set<string>([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
]);
const TYPE_CONTEXTS = new Set<string>([
  AST_NODE_TYPES.TSTypeAnnotation,
  AST_NODE_TYPES.TSTypeParameterInstantiation,
  AST_NODE_TYPES.TSTypeParameterDeclaration,
  AST_NODE_TYPES.TSTypeReference,
  AST_NODE_TYPES.TSTypeAliasDeclaration,
  AST_NODE_TYPES.TSInterfaceDeclaration,
]);
const AUTH_NAME = /(?:token|credentials?)$/i;
const MAX_DEPTH = 8;

export function isAuthName(name: string): boolean {
  return AUTH_NAME.test(name);
}

function isInTypePosition(identifier: TSESTree.Identifier): boolean {
  let node: TSESTree.Node | null | undefined = identifier.parent;
  while (node !== undefined && node !== null && !TYPE_CONTEXTS.has(node.type)) {
    node = node.parent;
  }
  return node !== undefined && node !== null;
}

export function isFunctionNode(node: TSESTree.Node | undefined): node is FunctionNode {
  return node !== undefined && FUNCTION_TYPES.has(node.type);
}

export function enclosingFunction(node: TSESTree.Node): FunctionNode | undefined {
  let current: TSESTree.Node | null | undefined = node.parent;
  while (current !== undefined && current !== null && !isFunctionNode(current)) {
    current = current.parent;
  }
  return current ?? undefined;
}

export function isReadPosition(identifier: TSESTree.Identifier): boolean {
  const parent = identifier.parent;
  if (parent.type === AST_NODE_TYPES.MemberExpression && parent.property === identifier) {
    return parent.computed;
  }
  if (parent.type === AST_NODE_TYPES.Property && parent.key === identifier) {
    return parent.computed || parent.shorthand;
  }
  return true;
}

export function identifiersIn(node: TSESTree.Node): TSESTree.Identifier[] {
  return [...depthFirst(node, nodeChildren)].filter(
    (child): child is TSESTree.Identifier =>
      child.type === AST_NODE_TYPES.Identifier && isReadPosition(child) && !isInTypePosition(child),
  );
}

export function variableOf(
  sourceCode: SourceCode,
  identifier: TSESTree.Identifier,
): Variable | undefined {
  let scope: TSESLint.Scope.Scope | null = sourceCode.getScope(identifier);
  while (scope !== null) {
    const variable = scope.set.get(identifier.name);
    if (variable !== undefined) {
      return variable;
    }
    scope = scope.upper;
  }
  return undefined;
}

export function scopeContains(outer: TSESLint.Scope.Scope, inner: TSESLint.Scope.Scope): boolean {
  let scope: TSESLint.Scope.Scope | null = inner;
  while (scope !== null) {
    if (scope === outer) {
      return true;
    }
    scope = scope.upper;
  }
  return false;
}

export function isBareCallee(identifier: TSESTree.Identifier): boolean {
  const parent = identifier.parent;
  return parent.type === AST_NODE_TYPES.CallExpression && parent.callee === identifier;
}

export function isCalleeUse(identifier: TSESTree.Identifier): boolean {
  const parent = identifier.parent;
  if (parent.type === AST_NODE_TYPES.CallExpression && parent.callee === identifier) {
    return true;
  }
  const grand = parent.parent;
  return (
    parent.type === AST_NODE_TYPES.MemberExpression &&
    parent.object === identifier &&
    grand?.type === AST_NODE_TYPES.CallExpression &&
    grand.callee === parent
  );
}

export function reachedVariables(
  sourceCode: SourceCode,
  start: TSESTree.Node,
  within: TSESLint.Scope.Scope,
): Map<Variable, TSESTree.Identifier[]> {
  const found = new Map<Variable, TSESTree.Identifier[]>();
  const visited = new Set<Variable>();
  const visit = (identifier: TSESTree.Identifier, depth: number) => {
    const variable = variableOf(sourceCode, identifier);
    if (variable === undefined || !scopeContains(within, variable.scope)) {
      return;
    }
    found.set(variable, [...(found.get(variable) ?? []), identifier]);
    if (visited.has(variable) || depth >= MAX_DEPTH) {
      return;
    }
    visited.add(variable);
    for (const reference of variable.references) {
      if (reference.writeExpr !== null && reference.writeExpr !== undefined) {
        walk(reference.writeExpr, depth + 1);
      }
    }
  };
  const walk = (node: TSESTree.Node, depth: number) => {
    for (const identifier of identifiersIn(node)) {
      visit(identifier, depth);
    }
  };
  walk(start, 0);
  return found;
}
