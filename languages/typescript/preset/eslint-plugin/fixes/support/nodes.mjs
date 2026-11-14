export function containsNode(sourceCode, root, { matches, intoFunctions = true }) {
  const pending = [root];
  for (const node of pending) {
    if (matches(node)) {
      return true;
    }
    const isFunction = /Function/u.test(node.type);
    if (isFunction && !intoFunctions && node !== root) {
      continue;
    }
    for (const key of sourceCode.visitorKeys[node.type] ?? []) {
      pending.push(...[node[key]].flat().filter((child) => child !== null && child !== undefined));
    }
  }
  return false;
}
