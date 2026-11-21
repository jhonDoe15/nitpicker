import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { someNode } from '../../collections/costly-forms/repeated-runs.mts';
import { isSettled } from '../repeated-calls/call-shapes.mts';
import { readsOnlyFixed } from '../support/loop-invariance.mts';

const EXITS = new Set<string>([
  AST_NODE_TYPES.BreakStatement,
  AST_NODE_TYPES.ContinueStatement,
  AST_NODE_TYPES.ReturnStatement,
  AST_NODE_TYPES.ThrowStatement,
]);

export function readsName(node: TSESTree.Node, name: string): boolean {
  return someNode(node, (child) => child.type === AST_NODE_TYPES.Identifier && child.name === name);
}

function endsInExit(statement: TSESTree.Statement): boolean {
  if (statement.type === AST_NODE_TYPES.BlockStatement) {
    const last = statement.body.at(-1);
    return last !== undefined && EXITS.has(last.type);
  }
  return EXITS.has(statement.type);
}

function callsReader(sourceCode: SourceCode, node: TSESTree.Node, name: string): boolean {
  return someNode(node, (child) => {
    if (
      child.type !== AST_NODE_TYPES.CallExpression ||
      child.callee.type !== AST_NODE_TYPES.Identifier
    ) {
      return false;
    }
    const definition = variableNamed(sourceCode, child.callee)?.defs[0];
    return definition !== undefined && readsName(definition.node, name);
  });
}

export function isEarlyExit(
  sourceCode: SourceCode,
  statement: TSESTree.Node | undefined,
  name: string,
): boolean {
  return (
    statement?.type === AST_NODE_TYPES.IfStatement &&
    statement.alternate === null &&
    endsInExit(statement.consequent) &&
    isSettled(statement.test) &&
    !readsName(statement.test, name) &&
    !readsName(statement.consequent, name) &&
    !callsReader(sourceCode, statement, name)
  );
}

export function isSettledAcrossAwait(sourceCode: SourceCode, test: TSESTree.Node): boolean {
  return readsOnlyFixed(sourceCode, test, false);
}
