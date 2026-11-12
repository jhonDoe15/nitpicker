/** The 1-based line of `index` in `text`. */
export const lineOfIndex = (text, index) => text.slice(0, index).split('\n').length;

/** Index of the first non-blank character at or after `from` (the length when there is none). */
export const nextCode = (text, from) => from + text.slice(from).search(/\S|$/u);

/** Index of the bracket that closes the one at `open`, or -1; `text` should be masked. */
export function closingBracket(text, open) {
  const pair = { '(': ')', '{': '}', '[': ']' }[text[open]];
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    depth += Number(text[index] === text[open]) - Number(text[index] === pair);
    if (depth === 0) return index;
  }
  return -1;
}

/** Index of the bracket that opens the one at `close`, or -1; `text` should be masked. */
export function openingBracket(text, close) {
  const pair = { ')': '(', '}': '{', ']': '[' }[text[close]];
  let depth = 0;
  for (let index = close; index >= 0; index -= 1) {
    depth += Number(text[index] === text[close]) - Number(text[index] === pair);
    if (depth === 0) return index;
  }
  return -1;
}
