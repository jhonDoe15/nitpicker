import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  ancestorsOf,
  depthFirst,
  nodeChildren,
  scopeChain,
  variableNamed,
  type SourceCode,
} from '../typed/node-views.mts';
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
  return ancestorsOf(identifier).some((node) => TYPE_CONTEXTS.has(node.type));
}

export function isFunctionNode(node: TSESTree.Node | undefined): node is FunctionNode {
  return node !== undefined && FUNCTION_TYPES.has(node.type);
}

export function enclosingFunction(node: TSESTree.Node): FunctionNode | undefined {
  return ancestorsOf(node).find(isFunctionNode);
}

function isReadPosition(identifier: TSESTree.Identifier): boolean {
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
  return variableNamed(sourceCode, identifier);
}

export function scopeContains(outer: TSESLint.Scope.Scope, inner: TSESLint.Scope.Scope): boolean {
  return scopeChain(inner).includes(outer);
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
  return (
    parent.type === AST_NODE_TYPES.MemberExpression &&
    parent.object === identifier &&
    parent.parent.type === AST_NODE_TYPES.CallExpression &&
    parent.parent.callee === parent
  );
}

type Reached = { readonly identifier: TSESTree.Identifier; readonly depth: number };

function writtenIdentifiers(variable: Variable, depth: number): Reached[] {
  return variable.references.flatMap((reference) => {
    const written = reference.writeExpr;
    if (written === null || written === undefined) {
      return [];
    }
    return identifiersIn(written).map((identifier) => ({ identifier, depth }));
  });
}

export function reachedVariables(
  sourceCode: SourceCode,
  start: TSESTree.Node,
  within: TSESLint.Scope.Scope,
): Map<Variable, TSESTree.Identifier[]> {
  const visited = new Set<Variable>();
  function resolve(item: Reached): Variable | undefined {
    const variable = variableOf(sourceCode, item.identifier);
    return variable !== undefined && scopeContains(within, variable.scope) ? variable : undefined;
  }
  function expand(item: Reached): Reached[] {
    const variable = resolve(item);
    if (variable === undefined || visited.has(variable) || item.depth >= MAX_DEPTH) {
      return [];
    }
    visited.add(variable);
    return writtenIdentifiers(variable, item.depth + 1);
  }
  const reached = identifiersIn(start).flatMap((identifier) => [
    ...depthFirst({ identifier, depth: 0 }, expand),
  ]);
  const found = new Map<Variable, TSESTree.Identifier[]>();
  for (const item of reached) {
    const variable = resolve(item);
    if (variable !== undefined) {
      found.set(variable, [...(found.get(variable) ?? []), item.identifier]);
    }
  }
  return found;
}
