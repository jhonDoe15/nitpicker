import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  chainOf,
  depthFirst,
  functionBinding,
  nameOf,
  nodeChildren,
} from '../typed/node-views.mts';
import { enclosingFunction, type FunctionNode } from '../typed/syntax-views.mts';

const WALKING_CALLEE =
  /^(?:dirname|up|escalade|pkgUp)$|ancestor|nearest|covering|upward|walkUp|findUp|parentDirector/iu;

function calleeIdentifier(callee: TSESTree.Node): string | undefined {
  return callee.type === AST_NODE_TYPES.MemberExpression ? nameOf(callee.property) : nameOf(callee);
}

export function walksUp(scope: TSESTree.Node): boolean {
  return [...depthFirst<TSESTree.Node>(scope, nodeChildren)].some(
    (node) =>
      (node.type === AST_NODE_TYPES.CallExpression &&
        WALKING_CALLEE.test(calleeIdentifier(node.callee) ?? '')) ||
      (node.type === AST_NODE_TYPES.Literal && node.value === '..'),
  );
}

function outermostFunction(node: TSESTree.Node): FunctionNode | undefined {
  return chainOf<FunctionNode>(enclosingFunction(node), enclosingFunction).at(-1);
}

function callersOf(program: TSESTree.Node, fn: FunctionNode): FunctionNode[] {
  const name = functionBinding(fn)?.name;
  if (name === undefined) {
    return [];
  }
  return [...depthFirst<TSESTree.Node>(program, nodeChildren)].flatMap((node) => {
    const caller =
      node.type === AST_NODE_TYPES.CallExpression && nameOf(node.callee) === name
        ? outermostFunction(node)
        : undefined;
    return caller === undefined || caller === fn ? [] : [caller];
  });
}

function unseenCallers(
  program: TSESTree.Node,
  fn: FunctionNode,
  seen: Set<FunctionNode>,
): FunctionNode[] {
  const unseen = [...new Set(callersOf(program, fn))].filter((caller) => !seen.has(caller));
  for (const caller of unseen) {
    seen.add(caller);
  }
  return unseen;
}

export function searchesParents(program: TSESTree.Node, lookup: TSESTree.Node): boolean {
  const start = outermostFunction(lookup);
  if (start === undefined) {
    return walksUp(program);
  }
  const seen = new Set<FunctionNode>([start]);
  const queue: FunctionNode[] = [start];
  for (const fn of queue) {
    if (walksUp(fn)) {
      return true;
    }
    queue.push(...unseenCallers(program, fn, seen));
  }
  return false;
}
