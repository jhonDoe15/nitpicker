export function childrenOf(node, visitorKeys) {
  return (visitorKeys[node.type] ?? []).flatMap((key) => [node[key]].flat()).filter(Boolean);
}
