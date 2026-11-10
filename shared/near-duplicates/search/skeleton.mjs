import { coarseKey } from '../align/lists.mjs';
import { digest } from '../tree/keys.mjs';
import { categoryOf, rebuild } from '../tree/nodes.mjs';

const IGNORED = new Set(['expression', 'type']);

export function skeletonKey(tree) {
  const text = rebuild(tree, (node, children) => {
    if (IGNORED.has(categoryOf(node)) || node.kind === 'parameters') {
      return '';
    }
    return `(${coarseKey(node)}${children.join('')})`;
  });
  return digest(text);
}
