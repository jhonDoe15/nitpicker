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

export function renderXml(node, depth = 0) {
  const pad = INDENT.repeat(depth);
  const open = `${pad}<${node.name}${attributesOf(node.attrs)}`;
  if (node.children.length > 0) {
    const inner = node.children.map((child) => renderXml(child, depth + 1)).join('\n');
    return `${open}>\n${inner}\n${pad}</${node.name}>`;
  }
  return node.text === undefined
    ? `${open}/>`
    : `${open}>${escapeXml(node.text).replaceAll('&quot;', '"')}</${node.name}>`;
}

export function element(name, attrs = {}, children = []) {
  return { name, attrs, children };
}
