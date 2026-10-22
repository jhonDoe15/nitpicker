export function createSource(file, rawText) {
  const text = (rawText.startsWith('﻿') ? rawText.slice(1) : rawText).replaceAll(/\r\n?/g, '\n');
  const lineStarts = [0];
  for (const match of text.matchAll(/\n/g)) {
    lineStarts.push(match.index + 1);
  }
  return { file, text, lineStarts };
}

export function lineOf(source, offset) {
  return source.lineStarts.findLastIndex((start) => start <= offset) + 1;
}

export function textOf(source, node) {
  return node === undefined ? '' : source.text.slice(node.s, node.e);
}

export function kids(node, type) {
  const children = node?.c ?? [];
  return type === undefined ? children : children.filter((child) => child.t === type);
}

export function kid(node, type) {
  return kids(node, type)[0];
}

export function descendants(node, predicate = () => true) {
  const nodes = [node];
  for (const [index, current] of nodes.entries()) {
    nodes.splice(index + 1, 0, ...kids(current));
  }
  return nodes.filter((current) => predicate(current));
}

export function identifierOf(source, node) {
  const identifier = kid(node, 'IDENTIFIER');
  return identifier === undefined ? undefined : textOf(source, identifier).replaceAll('`', '');
}
