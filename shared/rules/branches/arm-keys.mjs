import { canonicalTree } from '../../near-duplicates/canonical/canonical.mjs';
import { KEY_MODES, keyOf } from '../../near-duplicates/tree/keys.mjs';
import { isBound, nodesOf, rebuild } from '../../near-duplicates/tree/nodes.mjs';
import { chainOf } from '../../traversal.mjs';

const DECLARING = new Set(['declare', 'foreach', 'parameter']);
const SCOPES = {
  declare: new Set(['block', 'lambda']),
  parameter: new Set(['lambda']),
};

function declaredName(node) {
  if (DECLARING.has(node.kind)) {
    return node.children[1];
  }
  return node.kind === 'statement' && node.value === 'catch'
    ? node.children[node.children.length - 2]
    : undefined;
}

/** Names declared inside `root`: locals, loop variables, lambda and catch parameters. */
export function declaredNames(root) {
  return new Set(
    nodesOf(root)
      .map(declaredName)
      .filter(isBound)
      .map(({ value }) => value),
  );
}

function scopeOf(declaring, parents) {
  const kinds = SCOPES[declaring.kind];
  if (kinds === undefined) {
    return declaring;
  }
  const up = chainOf(parents.get(declaring), (node) =>
    kinds.has(node.kind) ? undefined : parents.get(node),
  );
  return up.at(-1) ?? declaring;
}

function isLocal(name, nodes, parents) {
  const declaring = nodes.filter((node) => declaredName(node)?.value === name);
  const declarations = new Set(declaring.map(declaredName));
  const inside = new Set(declaring.flatMap((node) => nodesOf(scopeOf(node, parents))));
  const uses = nodes.filter((node) => node.kind === 'name' && node.value === name);
  return declarations.has(uses[0]) && uses.every((use) => inside.has(use));
}

function localNames(scope) {
  const nodes = nodesOf(scope);
  const parents = new Map(nodes.flatMap((node) => node.children.map((child) => [child, node])));
  return new Set([...declaredNames(scope)].filter((name) => isLocal(name, nodes, parents)));
}

/**
 * The canonical key of a branch body or statement, with the names local to `scope` numbered and
 * every other name kept as written: two arms that differ only in a renamed local agree, two that
 * read different variables do not.
 */
export function branchKey(root, scope = root) {
  const local = localNames(scope);
  const outer = rebuild(root, (node, children) =>
    isBound(node) && !local.has(node.value)
      ? { ...node, children, binding: 'free', value: `outer:${node.value}` }
      : { ...node, children },
  );
  return keyOf(canonicalTree(outer).tree, KEY_MODES.exact);
}
