function postOrder(root) {
  const order = [root];
  for (const node of order) {
    order.push(...node.children);
  }
  return order.reverse();
}

function plain(node, done) {
  if (node.childCount === 0) {
    return node.text;
  }
  let out = '';
  let at = node.startIndex;
  for (const child of node.children) {
    out += node.text.slice(at - node.startIndex, child.startIndex - node.startIndex);
    out += done.get(child.id);
    at = child.endIndex;
  }
  return out + node.text.slice(at - node.startIndex);
}

export function rewritten(node, rules) {
  const done = new Map();
  function render(child) {
    return done.get(child.id);
  }
  for (const current of postOrder(node)) {
    const rule = rules.get(current.id);
    done.set(current.id, rule === undefined ? plain(current, done) : rule(render));
  }
  return done.get(node.id);
}
