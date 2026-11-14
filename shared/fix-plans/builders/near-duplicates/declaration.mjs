import { linesOf } from '../../plan-parts/source.mjs';
import { afterAnnotations, matchingClose, scanned } from './scan.mjs';

const LOOKAHEAD_LINES = 12;
const AFTER_LIST = /^\s*(?:\{|=>|->|=(?!=)|:|throws\b|where\b)/u;
const FUNCTION_KEYWORD = /\bfunction\b[^()]*$/u;
const BARE_ARROW =
  /^\s*(?:export\s+)?(?:const|let|var)\s+[\w$]+\s*(?::[^=]+)?=\s*(?:async\s+)?([\w$]+)\s*=>/u;

function isParameterList(code, open, close) {
  return (
    FUNCTION_KEYWORD.test(code.slice(0, open).trimEnd()) || AFTER_LIST.test(code.slice(close + 1))
  );
}

function listIn(code, start) {
  return [...code.matchAll(/\(/gu)]
    .map(({ index }) => index)
    .filter((open) => open >= start)
    .map((open) => [open, matchingClose(code, open)])
    .find(([open, close]) => close !== undefined && isParameterList(code, open, close));
}

/** The parameter list of the declaration that starts at `startLine`, as written, if it can be read. */
export function declaredParameters(text, startLine) {
  if (text === undefined) {
    return undefined;
  }
  const source = linesOf(text)
    .slice(startLine - 1, startLine - 1 + LOOKAHEAD_LINES)
    .join('\n');
  const { text: plain, code } = scanned(source);
  const found = listIn(code, afterAnnotations(code));
  if (found === undefined) {
    return BARE_ARROW.exec(code.slice(afterAnnotations(code)))?.[1];
  }
  return plain
    .slice(found[0] + 1, found[1])
    .replaceAll(/\s+/gu, ' ')
    .trim();
}

const WORD = /[\p{L}_$][\p{L}\p{N}_$]*/gu;

/** The identifiers written in lines `startLine` to `endLine` of `text`. */
export function wordsIn(text, startLine, endLine) {
  if (text === undefined) {
    return [];
  }
  const source = linesOf(text)
    .slice(startLine - 1, endLine)
    .join('\n');
  return scanned(source).code.match(WORD) ?? [];
}
