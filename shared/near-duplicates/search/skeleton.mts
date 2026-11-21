import { coarseKey } from '../align/lists.mts';
import { digest } from '../tree/keys.mts';
import { categoryOf, rebuild } from '../tree/nodes.mts';
import type { TreeNode } from '../tree/tree-types.mts';

const IGNORED = new Set(['expression', 'type']);

export function skeletonKey(tree: TreeNode): string {
  const text = rebuild(tree, (node: TreeNode, children: string[]): string => {
    if (IGNORED.has(categoryOf(node)) || node.kind === 'parameters') {
      return '';
    }
    return `(${coarseKey(node)}${children.join('')})`;
  });
  return digest(text);
}
