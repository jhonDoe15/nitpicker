import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, contains, type Ranged } from '../typed/node-views.mts';

const EXITS = new Set<string>([AST_NODE_TYPES.ReturnStatement, AST_NODE_TYPES.ThrowStatement]);

export function endsInExit(branch: TSESTree.Node | undefined): boolean {
  const last = branch?.type === AST_NODE_TYPES.BlockStatement ? branch.body.at(-1) : branch;
  return last !== undefined && EXITS.has(last.type);
}

function commonAncestor(left: TSESTree.Node, right: TSESTree.Node): TSESTree.Node | undefined {
  const outer = new Set(ancestorsOf(left));
  return ancestorsOf(right).find((ancestor) => outer.has(ancestor));
}

function branchesOf(node: TSESTree.Node): (TSESTree.Node | undefined)[] {
  if (
    node.type === AST_NODE_TYPES.IfStatement ||
    node.type === AST_NODE_TYPES.ConditionalExpression
  ) {
    return [node.consequent, node.alternate ?? undefined];
  }
  if (node.type === AST_NODE_TYPES.SwitchStatement) {
    return node.cases;
  }
  return node.type === AST_NODE_TYPES.TryStatement ? [node.block, node.handler ?? undefined] : [];
}

function exitsBefore(earlier: TSESTree.Node, later: Ranged): boolean {
  return ancestorsOf(earlier).some(
    (node) =>
      node.type === AST_NODE_TYPES.IfStatement &&
      node.range[1] <= later.range[0] &&
      [node.consequent, node.alternate ?? undefined].some(
        (branch) => branch !== undefined && contains(branch, earlier) && endsInExit(branch),
      ),
  );
}

export function inExclusiveBranches(left: TSESTree.Node, right: TSESTree.Node): boolean {
  const [earlier, later] = left.range[0] <= right.range[0] ? [left, right] : [right, left];
  if (exitsBefore(earlier, later)) {
    return true;
  }
  const ancestor = commonAncestor(left, right);
  if (ancestor === undefined) {
    return false;
  }
  const branches = branchesOf(ancestor).filter((branch) => branch !== undefined);
  const leftBranch = branches.find((branch) => contains(branch, left));
  const rightBranch = branches.find((branch) => contains(branch, right));
  return leftBranch !== undefined && rightBranch !== undefined && leftBranch !== rightBranch;
}
