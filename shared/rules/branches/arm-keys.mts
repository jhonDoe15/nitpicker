import { canonicalTree } from '../../near-duplicates/canonical/canonical.mts';
import { KEY_MODES, keyOf } from '../../near-duplicates/tree/keys.mts';
import { isBound, nodesOf, rebuild } from '../../near-duplicates/tree/nodes.mts';
import type { TreeNode } from '../../near-duplicates/tree/tree-types.mts';
import { chainOf } from '../../traversal.mts';

const DECLARING = new Set(['declare', 'foreach', 'parameter']);
const SCOPES: Readonly<Record<string, ReadonlySet<string>>> = {
  declare: new Set(['block', 'lambda']),
  parameter: new Set(['lambda']),
};

function declaredName(node: TreeNode): TreeNode | undefined {
  if (DECLARING.has(node.kind)) {
    return node.children[1];
  }
  return node.kind === 'statement' && node.value === 'catch'
    ? node.children[node.children.length - 2]
    : undefined;
}

export function declaredNames(root: TreeNode): Set<string> {
  return new Set(
    nodesOf(root)
      .map(declaredName)
      .filter(isBound)
      .map(({ value }) => value),
  );
}

function scopeOf(declaring: TreeNode, parents: ReadonlyMap<TreeNode, TreeNode>): TreeNode {
  const kinds = SCOPES[declaring.kind];
  if (kinds === undefined) {
    return declaring;
  }
  const up = chainOf(parents.get(declaring), (node: TreeNode) =>
    kinds.has(node.kind) ? undefined : parents.get(node),
  );
  return up.at(-1) ?? declaring;
}

function isLocal(
  name: string,
  nodes: readonly TreeNode[],
  parents: ReadonlyMap<TreeNode, TreeNode>,
): boolean {
  const declaring = nodes.filter((node) => declaredName(node)?.value === name);
  const declarations = new Set(declaring.map(declaredName));
  const inside = new Set(declaring.flatMap((node) => nodesOf(scopeOf(node, parents))));
  const uses = nodes.filter((node) => node.kind === 'name' && node.value === name);
  return declarations.has(uses[0]) && uses.every((use) => inside.has(use));
}

function localNames(scope: TreeNode): Set<string> {
  const nodes = nodesOf(scope);
  const parents = new Map(
    nodes.flatMap((node) => node.children.map((child): [TreeNode, TreeNode] => [child, node])),
  );
  return new Set([...declaredNames(scope)].filter((name) => isLocal(name, nodes, parents)));
}

export function branchKey(root: TreeNode, scope: TreeNode = root): string {
  const local = localNames(scope);
  const outer = rebuild<TreeNode, TreeNode>(root, (node, children) =>
    isBound(node) && !local.has(node.value)
      ? { ...node, children, binding: 'free', value: `outer:${node.value}` }
      : { ...node, children },
  );
  return keyOf(canonicalTree(outer).tree, KEY_MODES.exact);
}
