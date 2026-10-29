import { addComment, blank, createScan, finish, lineComment } from './lines.mjs';

/**
 * Masks Java or Kotlin source: comments and the insides of string and character literals become
 * spaces (newlines stay), so a pattern run over the masked text never matches inside either.
 * Kotlin differs in three ways the scanner follows: block comments nest, a string can hold a
 * `${ ... }` template whose code has strings of its own, and a backquoted name is an identifier
 * (left as written). Java text blocks and Kotlin raw strings are `"""` strings. `keepStrings`
 * masks the comments only, for files such as build scripts where the text of a string matters.
 */
export function maskCLike(text, { kotlin = false, keepStrings = false } = {}) {
  const scan = createScan(text, { kotlin, keepStrings });
  scanCode(scan, 0, false);
  return finish(scan);
}

function scanCode(scan, start, untilBrace) {
  let index = start;
  let depth = 0;
  while (index < scan.text.length) {
    const character = scan.text[index];
    if (untilBrace && character === '}' && depth === 0) return index + 1;
    if (untilBrace) depth += Number(character === '{') - Number(character === '}');
    index = step(scan, index);
  }
  return index;
}

function step(scan, index) {
  const pair = scan.text.slice(index, index + 2);
  const character = scan.text[index];
  if (pair === '//') return lineComment(scan, index, '//');
  if (pair === '/*') return blockComment(scan, index);
  if (character === '"') return stringLiteral(scan, index);
  if (character === "'") return characterLiteral(scan, index);
  if (character === '`' && scan.kotlin) return backquotedName(scan, index);
  return index + 1;
}

function blockComment(scan, from) {
  let index = from + 2;
  let depth = 1;
  while (index < scan.text.length && depth > 0) {
    const pair = scan.text.slice(index, index + 2);
    const opens = scan.kotlin && pair === '/*';
    const closes = pair === '*/';
    depth += Number(opens) - Number(closes);
    index += opens || closes ? 2 : 1;
  }
  addComment(scan, { from, to: index, delimiter: '/*', closer: depth === 0 ? '*/' : '' });
  return index;
}

function stringLiteral(scan, from) {
  const triple = scan.text.startsWith('"""', from);
  const quote = triple ? '"""' : '"';
  const end = stringEnd(scan, from + quote.length, { quote, escapes: !triple });
  if (!scan.keepStrings) {
    blank(scan, from + quote.length, Math.max(from + quote.length, end - quote.length));
  }
  return end;
}

function stringEnd(scan, from, { quote, escapes }) {
  let index = from;
  while (index < scan.text.length) {
    const character = scan.text[index];
    if (scan.text.startsWith(quote, index)) return index + quote.length;
    if (quote === '"' && character === '\n') return index;
    if (escapes && character === '\\') index += 2;
    else if (scan.kotlin && scan.text.startsWith('${', index))
      index = scanCode(scan, index + 2, true);
    else index += 1;
  }
  return index;
}

function characterLiteral(scan, from) {
  const end = stringEnd(scan, from + 1, { quote: "'", escapes: true });
  if (!scan.keepStrings) blank(scan, from + 1, Math.max(from + 1, end - 1));
  return end;
}

function backquotedName(scan, from) {
  const close = scan.text.indexOf('`', from + 1);
  return close === -1 ? from + 1 : close + 1;
}
