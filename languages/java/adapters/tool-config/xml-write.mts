import { appendAll } from '../../../../shared/lists/items.mjs';
import type { XmlElement } from '../../../../shared/values/xml.mts';

export type XmlNode = {
  readonly name: string;
  readonly attrs: Readonly<Record<string, string | undefined>>;
  readonly children: readonly XmlElement[];
  text?: string;
};

const INDENT = '  ';

export function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function attributesOf(attrs: XmlElement['attrs']): string {
  return Object.entries(attrs)
    .map(([name, value]) => ` ${name}="${escapeXml(value ?? '')}"`)
    .join('');
}

function leafLine(node: XmlElement, open: string): string {
  return node.text === undefined
    ? `${open}/>`
    : `${open}>${escapeXml(node.text).replaceAll('&quot;', '"')}</${node.name}>`;
}

function linesOf(node: XmlElement, rendered: ReadonlyMap<XmlElement, string[]>): string[] {
  const open = `<${node.name}${attributesOf(node.attrs)}`;
  if (node.children.length === 0) {
    return [leafLine(node, open)];
  }
  const inner = node.children.flatMap((child) =>
    (rendered.get(child) ?? []).map((line) => INDENT + line),
  );
  return [`${open}>`, ...inner, `</${node.name}>`];
}

export function renderXml(root: XmlElement): string {
  const order = [root];
  for (const node of order) {
    appendAll(order, node.children);
  }
  const rendered = new Map<XmlElement, string[]>();
  for (const node of order.toReversed()) {
    rendered.set(node, linesOf(node, rendered));
  }
  return (rendered.get(root) ?? []).join('\n');
}

export function element(
  name: string,
  attrs: XmlElement['attrs'] = {},
  children: readonly XmlElement[] = [],
): XmlNode {
  return { name, attrs, children };
}
