export function isBooleanLiteral(node) {
  return node?.type === 'Literal' && typeof node.value === 'boolean';
}
