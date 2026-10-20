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

function linesOf(node, rendered) {
  const open = `<${node.name}${attributesOf(node.attrs)}`;
  if (node.children.length === 0) {
    return [leafLine(node, open)];
  }
  const inner = node.children.flatMap((child) => rendered.get(child).map((line) => INDENT + line));
  return [`${open}>`, ...inner, `</${node.name}>`];
}

export function renderXml(root) {
  const order = [root];
  for (const node of order) {
    order.push(...node.children);
  }
  const rendered = new Map();
  for (const node of order.toReversed()) {
    rendered.set(node, linesOf(node, rendered));
  }
  return rendered.get(root).join('\n');
}

export function element(name, attrs = {}, children = []) {
  return { name, attrs, children };
}
