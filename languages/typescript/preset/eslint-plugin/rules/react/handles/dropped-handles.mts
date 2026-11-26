import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../../analysis/constant-resolution.mts';
import { rootNode } from '../../support/orm/chains.mts';
import { nodesOutsideNestedFunctions } from '../react-effects.mts';

export type HandleCall = {
  readonly call: TSESTree.CallExpression;
  readonly kept: TSESTree.Identifier | undefined;
};

function callOf(node: TSESTree.Expression | undefined): TSESTree.CallExpression | undefined {
  const inner = node?.type === AST_NODE_TYPES.ChainExpression ? node.expression : node;
  return inner?.type === AST_NODE_TYPES.CallExpression ? inner : undefined;
}

function droppedCall(node: TSESTree.Node): HandleCall | undefined {
  if (node.type !== AST_NODE_TYPES.ExpressionStatement) {
    return undefined;
  }
  const call = callOf(node.expression);
  return call === undefined ? undefined : { call, kept: undefined };
}

function unusedLocal(node: TSESTree.Node, sourceCode: TSESLint.SourceCode): HandleCall | undefined {
  if (
    node.type !== AST_NODE_TYPES.VariableDeclarator ||
    node.id.type !== AST_NODE_TYPES.Identifier
  ) {
    return undefined;
  }
  const call = callOf(node.init ?? undefined);
  const used = sourceCode
    .getDeclaredVariables(node)
    .some((variable) => variable.references.some((reference) => !reference.init));
  return call === undefined || used ? undefined : { call, kept: node.id };
}

function returnsCleanup(nodes: readonly TSESTree.Node[]): boolean {
  return nodes.some(
    (node) => node.type === AST_NODE_TYPES.ReturnStatement && node.argument !== null,
  );
}

function localReceiver(
  call: TSESTree.CallExpression,
  body: TSESTree.BlockStatement,
  sourceCode: TSESLint.SourceCode,
): boolean {
  const root =
    call.callee.type === AST_NODE_TYPES.MemberExpression ? rootNode(call.callee) : undefined;
  if (root?.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const [start, end] = body.range;
  const definition = findVariable({ sourceCode }, root, root.name)?.defs[0];
  return (
    definition !== undefined && definition.node.range[0] >= start && definition.node.range[1] <= end
  );
}

export function unreleasedCalls(
  body: TSESTree.BlockStatement,
  sourceCode: TSESLint.SourceCode,
): HandleCall[] {
  const nodes = nodesOutsideNestedFunctions(body);
  if (returnsCleanup(nodes)) {
    return [];
  }
  return nodes.flatMap((node) => {
    const found = droppedCall(node) ?? unusedLocal(node, sourceCode);
    return found === undefined || localReceiver(found.call, body, sourceCode) ? [] : [found];
  });
}
