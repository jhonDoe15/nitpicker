import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  ancestorsOf,
  depthFirst,
  nameOf,
  scopeChain,
  type SourceCode,
} from '../../typed/node-views.mts';
import {
  astChildren,
  chainEnd,
  functionName,
  isCloseName,
  isFunctionNode,
  unwrapExpression,
  type FunctionNode,
} from './close-scopes.mts';

type Variable = TSESLint.Scope.Variable;
export type BindingOwner =
  | {
      readonly container: TSESTree.Node;
      readonly name: string | undefined;
      readonly field: TSESTree.MemberExpression;
      readonly kind: 'field';
    }
  | {
      readonly container: TSESTree.Node;
      readonly name: string;
      readonly variable: Variable;
      readonly kind: 'variable';
    };
export type CloseScope = BindingOwner & { readonly closers: readonly FunctionNode[] };

const { DefinitionType, ScopeType } = TSESLint.Scope;

function containerOf(fn: FunctionNode): TSESTree.Node | undefined {
  const { parent } = fn;
  if (
    parent.type === AST_NODE_TYPES.MethodDefinition ||
    parent.type === AST_NODE_TYPES.PropertyDefinition
  ) {
    return parent.parent;
  }
  return ancestorsOf(fn).find(
    (ancestor) =>
      isFunctionNode(ancestor) ||
      ancestor.type === AST_NODE_TYPES.ClassBody ||
      ancestor.type === AST_NODE_TYPES.Program,
  );
}

export function childrenOf(node: TSESTree.Node): readonly TSESTree.Node[] {
  return node.type === AST_NODE_TYPES.Program ? node.body : astChildren(node);
}

export function closersOf(container: TSESTree.Node): FunctionNode[] {
  return [...depthFirst(container, childrenOf)].filter(
    (node): node is FunctionNode =>
      isFunctionNode(node) && isCloseName(functionName(node)) && containerOf(node) === container,
  );
}

function thisField(expression: TSESTree.Node): TSESTree.MemberExpression | undefined {
  const member = chainEnd(unwrapExpression(expression), (current) => {
    const inner = unwrapExpression(current);
    return inner.type === AST_NODE_TYPES.MemberExpression &&
      inner.object.type !== AST_NODE_TYPES.ThisExpression
      ? inner.object
      : undefined;
  });
  const field = unwrapExpression(member);
  return field.type === AST_NODE_TYPES.MemberExpression &&
    field.object.type === AST_NODE_TYPES.ThisExpression
    ? field
    : undefined;
}

export function rootIdentifier(expression: TSESTree.Node): TSESTree.Identifier | undefined {
  const root = chainEnd(unwrapExpression(expression), (current) => {
    const inner = unwrapExpression(current);
    return inner.type === AST_NODE_TYPES.MemberExpression ? inner.object : undefined;
  });
  const identifier = unwrapExpression(root);
  return identifier.type === AST_NODE_TYPES.Identifier ? identifier : undefined;
}

function longLivedVariable(
  sourceCode: SourceCode,
  identifier: TSESTree.Identifier,
): Variable | undefined {
  const variable = scopeChain(sourceCode.getScope(identifier))
    .map((scope) => scope.set.get(identifier.name))
    .find((found) => found !== undefined);
  const declared = variable?.defs.every(
    (definition) => definition.type === DefinitionType.Variable,
  );
  const type = variable?.scope.type;
  const long =
    type === ScopeType.function || type === ScopeType.module || type === ScopeType.global;
  return declared === true && long ? variable : undefined;
}

function bindingOwner(sourceCode: SourceCode, expression: TSESTree.Node): BindingOwner | undefined {
  const field = thisField(expression);
  if (field !== undefined) {
    const container = ancestorsOf(field).find(
      (ancestor) => ancestor.type === AST_NODE_TYPES.ClassBody,
    );
    return container === undefined
      ? undefined
      : { container, name: nameOf(field.property), field, kind: 'field' };
  }
  const identifier = rootIdentifier(expression);
  const variable = identifier && longLivedVariable(sourceCode, identifier);
  return identifier !== undefined && variable !== undefined
    ? { container: variable.scope.block, name: identifier.name, variable, kind: 'variable' }
    : undefined;
}

export function closeScope(
  sourceCode: SourceCode,
  expression: TSESTree.Node,
): CloseScope | undefined {
  const owner = bindingOwner(sourceCode, expression);
  if (owner === undefined) {
    return undefined;
  }
  const closers = closersOf(owner.container);
  return closers.length === 0 ? undefined : { ...owner, closers };
}
