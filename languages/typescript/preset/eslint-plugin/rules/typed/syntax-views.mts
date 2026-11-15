import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, type SourceContext } from '../analysis/constant-resolution.mts';
import { chainOf, nameOf } from './node-views.mts';

export type FunctionNode =
  TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;
export type ExportNode = TSESTree.ExportNamedDeclaration | TSESTree.ExportDefaultDeclaration;
type Wrapper =
  | TSESTree.TSNonNullExpression
  | TSESTree.TSAsExpression
  | TSESTree.TSSatisfiesExpression
  | TSESTree.TSTypeAssertion
  | TSESTree.TSInstantiationExpression
  | TSESTree.ChainExpression
  | TSESTree.AwaitExpression;
type VariableDefinition = TSESLint.Scope.Definitions.VariableDefinition;

const { DefinitionType } = TSESLint.Scope;

export const TYPE_ASSERTIONS = [
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.TSTypeAssertion,
];
export const NULLISH_WRAPPERS = [
  AST_NODE_TYPES.ChainExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSAsExpression,
];

function isWrapper(node: TSESTree.Node): node is Wrapper {
  return (
    node.type === AST_NODE_TYPES.TSNonNullExpression ||
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    node.type === AST_NODE_TYPES.TSTypeAssertion ||
    node.type === AST_NODE_TYPES.TSInstantiationExpression ||
    node.type === AST_NODE_TYPES.ChainExpression ||
    node.type === AST_NODE_TYPES.AwaitExpression
  );
}

export function wrappedExpression(
  node: TSESTree.Node,
  kinds: readonly AST_NODE_TYPES[],
): TSESTree.Node | undefined {
  if (!isWrapper(node)) {
    return undefined;
  }
  if (!kinds.includes(node.type)) {
    return undefined;
  }
  return node.type === AST_NODE_TYPES.AwaitExpression ? node.argument : node.expression;
}

export function unwrapOf(node: TSESTree.Node, kinds: readonly AST_NODE_TYPES[]): TSESTree.Node {
  return chainOf(node, (link) => wrappedExpression(link, kinds)).at(-1) ?? node;
}

export function callChainLink(node: TSESTree.Node): TSESTree.Node | undefined {
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return node.callee;
  }
  return node.type === AST_NODE_TYPES.MemberExpression ? node.object : undefined;
}

export function isFunction(node: TSESTree.Node): node is FunctionNode {
  return (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  );
}

export function isExport(node: TSESTree.Node): node is ExportNode {
  return (
    node.type === AST_NODE_TYPES.ExportNamedDeclaration ||
    node.type === AST_NODE_TYPES.ExportDefaultDeclaration
  );
}

export function calleeNameOf(callee: TSESTree.Node): string | undefined {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  return callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed
    ? nameOf(callee.property)
    : undefined;
}

function declaredName(statement: TSESTree.Node): string | undefined {
  const declaration = isExport(statement) ? statement.declaration : statement;
  if (declaration?.type === AST_NODE_TYPES.VariableDeclaration) {
    return nameOf(declaration.declarations[0].id);
  }
  return declaration !== null && 'id' in declaration ? nameOf(declaration.id) : undefined;
}

export function isExportedStatement(
  program: TSESTree.Node | undefined,
  statement: TSESTree.Node,
): boolean {
  if (isExport(statement)) {
    return true;
  }
  const name = declaredName(statement);
  return (
    name !== undefined &&
    program?.type === AST_NODE_TYPES.Program &&
    program.body.some(
      (other) =>
        other.type === AST_NODE_TYPES.ExportNamedDeclaration &&
        other.source === null &&
        other.specifiers.some((specifier) => nameOf(specifier.local) === name),
    )
  );
}

export function constDefinition(
  context: SourceContext,
  node: TSESTree.Identifier,
): VariableDefinition | undefined {
  const variable = findVariable(context, node, node.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  return definition?.type === DefinitionType.Variable && definition.parent.kind === 'const'
    ? definition
    : undefined;
}
