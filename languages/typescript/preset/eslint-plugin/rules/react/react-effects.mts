import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { memberName } from '../analysis/test-code-analysis.mts';
import { ancestorsOf, nameOf, variableNamed, type SourceCode } from '../typed/node-views.mts';

export type FunctionNode =
  TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;
export type EffectCallback = (TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression) & {
  readonly parent: TSESTree.CallExpression;
};
type ImportBindingDefinition = TSESLint.Scope.Definitions.ImportBindingDefinition;

const effectHooks = new Set(['useEffect', 'useLayoutEffect']);
const REACT_PACKAGE = 'react';
const REACT_NAMESPACE = 'React';

export function isFunctionNode(node: TSESTree.Node): node is FunctionNode {
  return (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  );
}

export function enclosingFunction(node: TSESTree.Node): FunctionNode | undefined {
  return ancestorsOf(node).find(isFunctionNode);
}

function importDefinition(
  variable: TSESLint.Scope.Variable | undefined,
): ImportBindingDefinition | undefined {
  const definition = variable?.defs.find(
    (each): each is ImportBindingDefinition =>
      each.type === TSESLint.Scope.DefinitionType.ImportBinding,
  );
  return definition?.parent.type === AST_NODE_TYPES.ImportDeclaration &&
    definition.parent.source.value === REACT_PACKAGE
    ? definition
    : undefined;
}

function namespaceName(sourceCode: SourceCode, identifier: TSESTree.Identifier): boolean {
  const variable = variableNamed(sourceCode, identifier);
  if (variable === undefined || variable.defs.length === 0) {
    return identifier.name === REACT_NAMESPACE;
  }
  const definition = importDefinition(variable);
  return definition !== undefined && definition.node.type !== AST_NODE_TYPES.ImportSpecifier;
}

export function hookName(sourceCode: SourceCode, callee: TSESTree.Node): string | undefined {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    const variable = variableNamed(sourceCode, callee);
    if (variable === undefined || variable.defs.length === 0) {
      return callee.name;
    }
    const definition = importDefinition(variable);
    return definition?.node.type === AST_NODE_TYPES.ImportSpecifier
      ? nameOf(definition.node.imported)
      : undefined;
  }
  const isNamespaceMember =
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    namespaceName(sourceCode, callee.object);
  return isNamespaceMember ? memberName(callee) : undefined;
}

export function isEffectCallback(
  sourceCode: SourceCode,
  node: TSESTree.Node,
): node is EffectCallback {
  if (!isFunctionNode(node)) {
    return false;
  }
  const call = node.parent;
  if (call.type !== AST_NODE_TYPES.CallExpression || call.arguments[0] !== node) {
    return false;
  }
  const name = hookName(sourceCode, call.callee);
  return name !== undefined && effectHooks.has(name);
}
