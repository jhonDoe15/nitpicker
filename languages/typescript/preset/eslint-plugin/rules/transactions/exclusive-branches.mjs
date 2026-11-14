import { ancestorsOf, contains } from '../analysis/ancestry.mjs';

const EXITS = new Set(['ReturnStatement', 'ThrowStatement']);

export function endsInExit(branch) {
  const last = branch?.type === 'BlockStatement' ? branch.body.at(-1) : branch;
  return last !== undefined && EXITS.has(last.type);
}

function commonAncestor(left, right) {
  const outer = new Set(ancestorsOf(left));
  return ancestorsOf(right).find((ancestor) => outer.has(ancestor));
}

function branchesOf(node) {
  if (node.type === 'IfStatement' || node.type === 'ConditionalExpression') {
    return [node.consequent, node.alternate];
  }
  if (node.type === 'SwitchStatement') {
    return node.cases;
  }
  return node.type === 'TryStatement' ? [node.block, node.handler] : [];
}

function exitsBefore(earlier, later) {
  return ancestorsOf(earlier).some(
    (node) =>
      node.type === 'IfStatement' &&
      node.range[1] <= later.range[0] &&
      [node.consequent, node.alternate].some(
        (branch) => branch !== null && contains(branch, earlier) && endsInExit(branch),
      ),
  );
}

export function inExclusiveBranches(left, right) {
  const [earlier, later] = left.range[0] <= right.range[0] ? [left, right] : [right, left];
  if (exitsBefore(earlier, later)) {
    return true;
  }
  const ancestor = commonAncestor(left, right);
  if (ancestor === undefined) {
    return false;
  }
  const branches = branchesOf(ancestor).filter(Boolean);
  const leftBranch = branches.find((branch) => contains(branch, left));
  const rightBranch = branches.find((branch) => contains(branch, right));
  return leftBranch !== undefined && rightBranch !== undefined && leftBranch !== rightBranch;
}
