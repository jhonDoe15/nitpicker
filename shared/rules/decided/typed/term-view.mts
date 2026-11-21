import { present } from '../../../near-duplicates/tree/nodes.mts';
import type { Term } from '../../../logic/typed/term-types.mts';
import type { TreeNode } from '../../../near-duplicates/tree/tree-types.mts';
import type { Memo } from './memo.mts';

function unviewedOrder(root: TreeNode, views: Memo<TreeNode, Term>): TreeNode[] {
  const order = [root];
  for (const node of order) {
    if (views.has(node)) {
      continue;
    }
    for (const child of node.children) {
      order.push(child);
    }
  }
  return order;
}

function rememberView(node: TreeNode, views: Memo<TreeNode, Term>): void {
  if (views.has(node)) {
    return;
  }
  views.remember(node, {
    ...node,
    value: node.value,
    children: node.children.map((child) => present(views.get(child))),
    range: undefined,
  });
}

export function termView(root: TreeNode, views: Memo<TreeNode, Term>): Term {
  for (const node of unviewedOrder(root, views).toReversed()) {
    rememberView(node, views);
  }
  return present(views.get(root));
}
