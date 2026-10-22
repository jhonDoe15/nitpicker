import { kids, textOf } from '../kotlin-tree.mjs';

const QUOTES = new Set(['OPEN_QUOTE', 'CLOSING_QUOTE']);
const DOLLAR = "${'$'}";
const ESCAPES = { n: '\n', t: '\t', r: '\r' };

export function templateEntries(source, node) {
  return kids(node)
    .filter((entry) => !QUOTES.has(entry.t))
    .map((entry) => ({
      node: entry,
      text: textOf(source, entry),
      dynamic:
        entry.t === 'SHORT_STRING_TEMPLATE_ENTRY' || entry.t === 'LONG_STRING_TEMPLATE_ENTRY',
      expression: kids(entry)[1],
      escape: entry.t === 'ESCAPE_STRING_TEMPLATE_ENTRY',
    }));
}

function valueOf({ text, escape }) {
  if (text === DOLLAR) {
    return '$';
  }
  return escape ? (ESCAPES[text.slice(1)] ?? text.slice(1)) : text;
}

export function plainText(source, node) {
  if (node?.t !== 'STRING_TEMPLATE') {
    return undefined;
  }
  const entries = templateEntries(source, node);
  return entries.some((entry) => entry.dynamic && entry.text !== DOLLAR)
    ? undefined
    : entries.map(valueOf).join('');
}

export function isStringTemplate(node) {
  return node?.t === 'STRING_TEMPLATE';
}
