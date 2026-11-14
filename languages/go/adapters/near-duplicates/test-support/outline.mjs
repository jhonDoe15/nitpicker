import { foldTree } from '../../../../../shared/traversal.mjs';

function label(node) {
  const value = node.value === undefined ? '' : `:${node.value}`;
  const binding = node.binding === 'bound' && node.text !== node.value ? `=${node.value}` : '';
  return `${node.kind}${value}${binding}`;
}

export function outline(root) {
  return foldTree(root, undefined, {
    expand: (node) => node.children.map((child) => [child, undefined]),
    combine: (node, _context, parts) =>
      parts.length === 0 ? label(node) : `${label(node)}(${parts.join(' ')})`,
  });
}

export function bodyOf(unit) {
  return unit.tree.children[2];
}

export function statements(unit) {
  return bodyOf(unit).children.map((statement) => outline(statement));
}
