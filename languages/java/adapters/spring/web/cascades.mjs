import { closingOf } from '../proxies/java-declarations.mjs';

const VALID = /@\s*(?:\w+\s*\.\s*)*Valid(?![\w$])/gu;
const ANNOTATION = /\s*@\s*[\w.]+/uy;
const MODIFIER = /\s*(?:private|protected|public|final|static|transient|volatile)(?![\w$])/uy;
const TYPE = /\s*[\w.]+/uy;
const MEMBER_END = /\s+\w+\s*[;=,)(]/uy;
const ELEMENT = /\s+([\w.]+)\s*[>,]/uy;
const STATEMENT_MARKS = ';={}()';
const ARRAY = /(?:\s*\[\s*\])*/uy;

function skipAll(text, start, pattern) {
  const positions = [start];
  for (const from of positions) {
    pattern.lastIndex = from;
    if (pattern.test(text)) {
      const end = pattern.lastIndex;
      positions.push(text[end] === '(' && pattern === ANNOTATION ? closingOf(text, end) + 1 : end);
    }
  }
  return positions.at(-1);
}

function genericsEnd(text, start) {
  const at = start + (/^\s*/u.exec(text.slice(start))?.[0].length ?? 0);
  if (text[at] !== '<') {
    return start;
  }
  let depth = 0;
  for (const [offset, character] of text.slice(at).split('').entries()) {
    depth += character === '<' ? 1 : 0;
    depth -= character === '>' ? 1 : 0;
    if (depth === 0) {
      return at + offset + 1;
    }
    if (STATEMENT_MARKS.includes(character)) {
      break;
    }
  }
  return start;
}

function memberType(text, start) {
  const afterAnnotations = skipAll(text, start, ANNOTATION);
  const afterModifiers = skipAll(text, afterAnnotations, MODIFIER);
  TYPE.lastIndex = afterModifiers;
  if (!TYPE.test(text)) {
    return undefined;
  }
  const typeEnd = genericsEnd(text, TYPE.lastIndex);
  ARRAY.lastIndex = typeEnd;
  ARRAY.test(text);
  MEMBER_END.lastIndex = ARRAY.lastIndex;
  return MEMBER_END.test(text) ? text.slice(afterModifiers, typeEnd) : undefined;
}

function elementType(text, start) {
  ELEMENT.lastIndex = start;
  return ELEMENT.exec(text)?.[1];
}

export function cascadedTypeTexts(region) {
  return [...region.matchAll(VALID)]
    .map((match) => {
      const start = match.index + match[0].length;
      return memberType(region, start) ?? elementType(region, start);
    })
    .filter((type) => type !== undefined);
}
