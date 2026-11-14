import { chainOf } from '../../../traversal.mjs';

const TOKEN =
  /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|#(?=\s|$)[^\n]*|"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|`(?:[^`\\]|\\[\s\S])*`?/gu;
const QUOTES = new Set(['"', "'", '`']);

function blanked(piece) {
  return piece.replaceAll(/[^\n]/gu, ' ');
}

function hollowString(piece) {
  const closed = piece.length > 1 && piece.at(-1) === piece[0];
  return `${piece[0]}${blanked(piece.slice(1, closed ? -1 : undefined))}${closed ? piece[0] : ''}`;
}

function withoutComments(piece) {
  return QUOTES.has(piece[0]) ? piece : blanked(piece);
}

function withoutInsides(piece) {
  return QUOTES.has(piece[0]) ? hollowString(piece) : blanked(piece);
}

/**
 * `source` read twice at the same offsets: `text` with its comments blanked, and `code` with its
 * comments and the insides of its strings blanked too, so brackets can be counted in it.
 */
export function scanned(source) {
  return {
    text: source.replaceAll(TOKEN, withoutComments),
    code: source.replaceAll(TOKEN, withoutInsides),
  };
}

export function matchingClose(code, open) {
  let depth = 0;
  for (const [offset, character] of code.slice(open).split('').entries()) {
    depth += character === '(' ? 1 : 0;
    depth -= character === ')' ? 1 : 0;
    if (depth === 0) {
      return open + offset;
    }
  }
  return undefined;
}

function spacesAt(code, at) {
  return /^\s*/u.exec(code.slice(at))[0].length;
}

function afterBrackets(code, at) {
  const open = at + spacesAt(code, at);
  const close = code[open] === '(' ? matchingClose(code, open) : undefined;
  return close === undefined ? at : close + 1;
}

function nextAnnotation(code, { at }) {
  if (code[at] !== '@' || code.startsWith('@interface', at)) {
    return undefined;
  }
  const name = /^@[\w.$]+/u.exec(code.slice(at))?.[0].length ?? 1;
  const after = afterBrackets(code, at + name);
  return { at: after + spacesAt(code, after) };
}

export function afterAnnotations(code) {
  return chainOf({ at: spacesAt(code, 0) }, (position) => nextAnnotation(code, position)).at(-1).at;
}
