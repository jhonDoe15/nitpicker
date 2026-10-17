const INDENT = '  ';

export function escapeXml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function attributesOf(attrs) {
  return Object.entries(attrs)
    .map(([name, value]) => ` ${name}="${escapeXml(value)}"`)
    .join('');
}

function leafLine(node, open) {
  return node.text === undefined
    ? `${open}/>`
    : `${open}>${escapeXml(node.text).replaceAll('&quot;', '"')}</${node.name}>`;
}

export function renderXml(root) {
  const lines = [];
  const stack = [{ node: root, depth: 0, closing: false }];
  while (stack.length > 0) {
    const { node, depth, closing } = stack.pop();
    const pad = INDENT.repeat(depth);
    if (closing) {
      lines.push(`${pad}</${node.name}>`);
    } else if (node.children.length === 0) {
      lines.push(leafLine(node, `${pad}<${node.name}${attributesOf(node.attrs)}`));
    } else {
      lines.push(`${pad}<${node.name}${attributesOf(node.attrs)}>`);
      stack.push({ node, depth, closing: true });
      for (const child of node.children.toReversed()) {
        stack.push({ node: child, depth: depth + 1, closing: false });
      }
    }
  }
  return lines.join('\n');
}

export function element(name, attrs = {}, children = []) {
  return { name, attrs, children };
}
