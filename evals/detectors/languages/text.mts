const CLOSERS = new Map([
  ['(', ')'],
  ['{', '}'],
  ['[', ']'],
]);

const OPENERS = new Map([
  [')', '('],
  ['}', '{'],
  [']', '['],
]);

export function lineOfIndex(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

export function nextCode(text: string, from: number): number {
  return from + text.slice(from).search(/\S|$/u);
}

export function closingBracket(text: string, open: number): number {
  const pair = CLOSERS.get(text.charAt(open));
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    depth += Number(text[index] === text[open]) - Number(text[index] === pair);
    if (depth === 0) return index;
  }
  return -1;
}

export function openingBracket(text: string, close: number): number {
  const pair = OPENERS.get(text.charAt(close));
  let depth = 0;
  for (let index = close; index >= 0; index -= 1) {
    depth += Number(text[index] === text[close]) - Number(text[index] === pair);
    if (depth === 0) return index;
  }
  return -1;
}
