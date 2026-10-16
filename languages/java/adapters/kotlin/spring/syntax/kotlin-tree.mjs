export function createSource(file, rawText) {
  const text = (rawText.startsWith('﻿') ? rawText.slice(1) : rawText).replaceAll(/\r\n?/g, '\n');
  const lineStarts = [0];
  for (const match of text.matchAll(/\n/g)) {
    lineStarts.push(match.index + 1);
  }
  return { file, text, lineStarts };
}

export function lineOf(source, offset) {
  let low = 0;
  let high = source.lineStarts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (source.lineStarts[middle] <= offset) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low + 1;
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
  const found = [];
  const pending = [node];
  while (pending.length > 0) {
    const current = pending.pop();
    if (predicate(current)) {
      found.push(current);
    }
    pending.push(...kids(current).toReversed());
  }
  return found;
}

export function identifierOf(source, node) {
  const identifier = kid(node, 'IDENTIFIER');
  return identifier === undefined ? undefined : textOf(source, identifier).replaceAll('`', '');
}
