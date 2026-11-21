import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, type SourceContext } from '../../analysis/constant-resolution.mts';
import { chainOf } from '../../typed/node-views.mts';
import { enclosingFunction } from '../../typed/syntax-views.mts';
import { callsMethodIn } from '../../loops/repeats/loop-names.mts';
import { isListing } from './list-sources.mts';

const { DefinitionType } = TSESLint.Scope;
const NARROWING = new Set(['filter', 'flatMap']);

function receiverOf(node: TSESTree.Node): TSESTree.Node | undefined {
  const value = node.type === AST_NODE_TYPES.AwaitExpression ? node.argument : node;
  return value.type === AST_NODE_TYPES.CallExpression &&
    value.callee.type === AST_NODE_TYPES.MemberExpression
    ? value.callee.object
    : undefined;
}

function filtersOrLists(context: SourceContext, node: TSESTree.Node | undefined): boolean {
  return chainOf(node, receiverOf).some(
    (step) => callsMethodIn(step, NARROWING) || isListing(context, step),
  );
}

export function possiblyEmptyList(context: SourceContext, node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.Identifier) {
    return filtersOrLists(context, node);
  }
  const variable = findVariable(context, node, node.name);
  const definition = variable?.defs[0];
  if (
    definition?.type !== DefinitionType.Variable ||
    definition.parent.kind !== 'const' ||
    definition.node.id.type !== AST_NODE_TYPES.Identifier
  ) {
    return false;
  }
  const scope = enclosingFunction(node) ?? context.sourceCode.ast;
  const declaredHere = (enclosingFunction(definition.node) ?? context.sourceCode.ast) === scope;
  return (
    declaredHere &&
    filtersOrLists(context, definition.node.init ?? undefined) &&
    variable?.references.filter((reference) => reference.isRead()).length === 1
  );
}
