import { blank, createScan, finish, lineComment } from './lines.mjs';

/**
 * Masks Python source: comments and the insides of string literals (docstrings and triple-quoted
 * strings included) become spaces, newlines stay. A prefix such as `f` or `rb` stays as written.
 * With `keepStrings` only the comments are blanked.
 */
export function maskPython(text, { keepStrings = false } = {}) {
  const scan = createScan(text, { keepStrings });
  let index = 0;
  while (index < text.length) {
    const character = text[index];
    if (character === '#') index = lineComment(scan, index, '#');
    else if (character === '"' || character === "'") index = stringLiteral(scan, index);
    else index += 1;
  }
  return finish(scan);
}

function stringLiteral(scan, from) {
  const mark = scan.text[from];
  const quote = scan.text.startsWith(mark.repeat(3), from) ? mark.repeat(3) : mark;
  let index = from + quote.length;
  while (index < scan.text.length && !scan.text.startsWith(quote, index)) {
    if (quote.length === 1 && scan.text[index] === '\n') break;
    index += scan.text[index] === '\\' ? 2 : 1;
  }
  index = Math.min(index, scan.text.length);
  if (!scan.keepStrings) blank(scan, from + quote.length, index);
  return scan.text.startsWith(quote, index) ? index + quote.length : index;
}
