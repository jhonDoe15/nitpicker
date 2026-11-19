import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { isLeavingCall, type Environment } from './branch-calls/leaving-calls.mts';
import { isPlaceholderCall } from './branch-calls/placeholder-calls.mts';
import { nodesWithin, targetKey } from './null-targets.mts';

const LEAVING = new Set<string>([
  AST_NODE_TYPES.ReturnStatement,
  AST_NODE_TYPES.ThrowStatement,
  AST_NODE_TYPES.BreakStatement,
  AST_NODE_TYPES.ContinueStatement,
]);

export type BranchFacts = {
  readonly acts: boolean;
  readonly leaves: boolean;
  readonly initialises: boolean;
  readonly callees: ReadonlySet<string>;
};

function mentionsKey(node: TSESTree.Node, key: string): boolean {
  return nodesWithin(node).some((inner) => targetKey(inner) === key);
}

function assignsKey(node: TSESTree.Node, key: string): boolean {
  if (node.type !== AST_NODE_TYPES.AssignmentExpression) {
    return false;
  }
  const { left } = node;
  const pattern =
    left.type === AST_NODE_TYPES.ObjectPattern || left.type === AST_NODE_TYPES.ArrayPattern;
  return pattern ? mentionsKey(left, key) : targetKey(left) === key;
}

function acts(branch: TSESTree.Statement): boolean {
  if (branch.type === AST_NODE_TYPES.BlockStatement) {
    return branch.body.some((statement) => statement.type !== AST_NODE_TYPES.EmptyStatement);
  }
  return branch.type !== AST_NODE_TYPES.EmptyStatement;
}

export function branchFacts(
  branch: TSESTree.Statement,
  key: string,
  environment: Environment,
): BranchFacts {
  const nodes = nodesWithin(branch);
  const standIns = nodes.filter(
    (node) =>
      node.type === AST_NODE_TYPES.CallExpression &&
      !node.arguments.some((argument) => mentionsKey(argument, key)),
  );
  return {
    acts: acts(branch),
    leaves: nodes.some(
      (node) => LEAVING.has(node.type) || isLeavingCall(node, environment) || assignsKey(node, key),
    ),
    initialises: nodes.some(
      (node) => node.type === AST_NODE_TYPES.CallExpression && !isPlaceholderCall(node),
    ),
    callees: new Set(
      standIns.flatMap((node) =>
        node.type === AST_NODE_TYPES.CallExpression
          ? [environment.sourceCode.getText(node.callee)]
          : [],
      ),
    ),
  };
}
