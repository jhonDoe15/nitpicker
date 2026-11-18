import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  ancestorsOf,
  depthFirst,
  nameOf,
  variableNamed,
  type SourceCode,
} from '../typed/node-views.mts';
import { isFunction } from '../typed/syntax-views.mts';
import { syntaxChildren } from '../decided/syntax.mts';
import type { TypedFacts } from '../promises/cannot-reject.mts';

const GUARD_CALLS = new Set(['some', 'find', 'findIndex', 'at']);
const GUARD_FUNCTIONS = new Set(['isNonEmpty', 'isEmpty', 'nonEmpty', 'hasItems', 'hasAny']);

export function isFilterCall(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(node.callee.property) === 'filter'
  );
}

function isParameter(sourceCode: SourceCode, identifier: TSESTree.Identifier): boolean {
  const definition = variableNamed(sourceCode, identifier)?.defs.at(0);
  return definition?.type === TSESLint.Scope.DefinitionType.Parameter;
}

function isFilteredVariable(sourceCode: SourceCode, identifier: TSESTree.Identifier): boolean {
  const declarator = variableNamed(sourceCode, identifier)?.defs.at(0)?.node;
  return (
    declarator?.type === AST_NODE_TYPES.VariableDeclarator &&
    declarator.init !== null &&
    isFilterCall(declarator.init)
  );
}

export function isTrackedReceiver(sourceCode: SourceCode, receiver: TSESTree.Node): boolean {
  switch (receiver.type) {
    case AST_NODE_TYPES.CallExpression:
      return isFilterCall(receiver);
    case AST_NODE_TYPES.Identifier:
      return isParameter(sourceCode, receiver) || isFilteredVariable(sourceCode, receiver);
    case AST_NODE_TYPES.MemberExpression:
      return !receiver.computed;
    default:
      return false;
  }
}

function propertyName(node: TSESTree.MemberExpression): string | undefined {
  return node.computed ? undefined : nameOf(node.property);
}

function isGuard(facts: TypedFacts, node: TSESTree.Node, target: string): boolean {
  const text = (value: TSESTree.Node): string => facts.sourceCode.getText(value);
  if (node.type === AST_NODE_TYPES.MemberExpression && text(node.object) === target) {
    return propertyName(node) === 'length' || (node.computed && text(node.property) === '0');
  }
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const { callee } = node;
  if (callee.type === AST_NODE_TYPES.MemberExpression) {
    return text(callee.object) === target && GUARD_CALLS.has(propertyName(callee) ?? '');
  }
  return (
    GUARD_FUNCTIONS.has(nameOf(callee) ?? '') &&
    node.arguments.some((argument) => text(argument) === target)
  );
}

export function isGuardedAgainstEmpty(
  facts: TypedFacts,
  call: TSESTree.CallExpression,
  receiver: TSESTree.Node,
): boolean {
  const target = facts.sourceCode.getText(receiver);
  const scope = ancestorsOf(call).find(isFunction) ?? facts.sourceCode.ast;
  return [...depthFirst<TSESTree.Node>(scope, syntaxChildren)].some((node) =>
    isGuard(facts, node, target),
  );
}
