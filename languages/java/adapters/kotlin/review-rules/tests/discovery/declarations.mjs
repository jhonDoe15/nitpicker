import { closingIndex } from '../../../scan/kotlin-source.mjs';
import { repeatUntil } from './repeat.mjs';

const MODIFIERS = new Set([
  'public',
  'private',
  'protected',
  'internal',
  'open',
  'final',
  'abstract',
  'sealed',
  'inner',
  'data',
  'value',
  'enum',
  'annotation',
  'override',
  'suspend',
  'inline',
  'operator',
  'infix',
  'tailrec',
  'external',
  'lateinit',
  'const',
  'expect',
  'actual',
  'companion',
]);
const OPENERS = { ')': '(', ']': '[', '}': '{' };
const BRACKET_MARKS = { ')': /[()]/gu, ']': /[[\]]/gu, '}': /[{}]/gu };
const ANNOTATION_HEAD = /@(?:\w+\s*:\s*)?([\w.`]+)$/u;
const WORD_TAIL = /[\w`]+$/u;
const CLASS_KEYWORD = /(?<![\w.:`])(class|object|interface)\b(?!\s*[=)])/gu;
const NAME_HEAD = /^\s*(`[^`]+`|[A-Za-z_]\w*)/u;
const FUNCTION_KEYWORD = /(?<![\w.`])fun[ \t]([^(){}=\n]*)\(/gu;
const FUNCTION_NAME = /(`[^`]+`|[A-Za-z_]\w*)$/u;
const SUPERTYPE_HEAD = /^\s*([\w.]+)/u;
const CONTINUATION_START = /^\s*(?:\.|\?[.:]|&&|\|\|)/u;
const BRACKET_OPEN = /[({[]/gu;
const BRACKET_CLOSE = /[)}\]]/gu;
const NEXT_ANGLE = { '<': 1, '>': -1 };
const MAX_ANNOTATION_TOKENS = 40;

export function matchingOpen(code, close) {
  const opener = OPENERS[code[close]];
  const stack = [];
  for (const { index, 0: mark } of code.slice(0, close).matchAll(BRACKET_MARKS[code[close]])) {
    if (mark === opener) {
      stack.push(index);
    } else {
      stack.pop();
    }
  }
  return stack.at(-1) ?? -1;
}

function simpleName(qualified) {
  return qualified.replaceAll('`', '').split('.').at(-1);
}

function precedingToken({ code, source }, end) {
  let tail = code.slice(0, end).trimEnd().length;
  let args;
  if (code[tail - 1] === ')') {
    const open = matchingOpen(code, tail - 1);
    if (open < 0) {
      return undefined;
    }
    args = source.slice(open + 1, tail - 1);
    tail = code.slice(0, open).trimEnd().length;
  }
  const head = code.slice(0, tail);
  const annotation = ANNOTATION_HEAD.exec(head);
  if (annotation !== null) {
    return { start: annotation.index, name: simpleName(annotation[1]), args: args ?? '' };
  }
  const word = WORD_TAIL.exec(head)?.[0];
  return args === undefined && MODIFIERS.has(word)
    ? { start: head.length - word.length }
    : undefined;
}

function annotationsBefore(scanned, index) {
  const annotations = [];
  const state = { end: index };
  repeatUntil(MAX_ANNOTATION_TOKENS, () => {
    const token = precedingToken(scanned, state.end);
    if (token === undefined) {
      return true;
    }
    state.end = token.start;
    if (token.name !== undefined) {
      annotations.unshift({ name: token.name, args: token.args, offset: token.start });
    }
    return false;
  });
  return annotations;
}

function nextSignificant(code, from) {
  return code[from + code.slice(from).search(/\S|$/u)];
}

function previousSignificant(code, before) {
  return code.slice(0, before).trimEnd().at(-1);
}

function continuesHeader(code, newline) {
  const continues = '{,:'.includes(nextSignificant(code, newline + 1) ?? ' ');
  const hanging = ',:'.includes(previousSignificant(code, newline) ?? ' ');
  return continues || hanging;
}

function trackHeader(state, char, index) {
  state.depth += '(['.includes(char) ? 1 : 0;
  state.depth -= ')]'.includes(char) ? 1 : 0;
  state.angle += state.depth === 0 ? (NEXT_ANGLE[char] ?? 0) : 0;
  if (char === ':' && state.depth === 0 && state.angle === 0 && state.colon < 0) {
    state.colon = index + 1;
  }
}

function headerEnd(code, from) {
  const state = { depth: 0, angle: 0, colon: -1 };
  for (const [offset, char] of code.slice(from).split('').entries()) {
    const index = from + offset;
    if (state.depth === 0 && char === '{') {
      return { bodyOpen: index, end: index, colon: state.colon };
    }
    trackHeader(state, char, index);
    const flat = state.depth === 0 && state.angle === 0;
    if (char === '\n' && flat && !continuesHeader(code, index)) {
      return { bodyOpen: -1, end: index, colon: state.colon };
    }
  }
  return { bodyOpen: -1, end: code.length, colon: state.colon };
}

function splitTopLevel(code, from, to) {
  const parts = [];
  const state = { depth: 0, start: from };
  for (const [offset, char] of code.slice(from, to).split('').entries()) {
    const index = from + offset;
    state.depth += '([<{'.includes(char) ? 1 : 0;
    state.depth -= ')]>}'.includes(char) && code.slice(index - 1, index + 1) !== '->' ? 1 : 0;
    if (char === ',' && state.depth === 0) {
      parts.push([state.start, index]);
      state.start = index + 1;
    }
  }
  return [...parts, [state.start, to]];
}

function supertypesOf(code, header) {
  if (header.colon < 0) {
    return [];
  }
  return splitTopLevel(code, header.colon, header.end).flatMap(([from, to]) => {
    const head = SUPERTYPE_HEAD.exec(code.slice(from, to));
    const paren = code.slice(from, to).indexOf('(');
    return head === null
      ? []
      : [{ name: simpleName(head[1]), callOpen: paren < 0 ? -1 : from + paren }];
  });
}

function classAt(scanned, match) {
  const { code } = scanned;
  const named = NAME_HEAD.exec(code.slice(match.index + match[0].length));
  if (named === null && match[1] !== 'object') {
    return [];
  }
  const after = match.index + match[0].length + (named === null ? 0 : named[0].length);
  const header = headerEnd(code, after);
  return [
    {
      kind: match[1],
      name: named === null ? 'object' : simpleName(named[1]),
      offset: match.index,
      annotations: annotationsBefore(scanned, match.index),
      supers: supertypesOf(code, header),
      bodyOpen: header.bodyOpen,
      bodyClose: header.bodyOpen < 0 ? -1 : closingIndex(code, header.bodyOpen),
    },
  ];
}

export function classesOf(scanned) {
  return [...scanned.code.matchAll(CLASS_KEYWORD)].flatMap((match) => classAt(scanned, match));
}

function indentOf(code, index) {
  const start = code.lastIndexOf('\n', index) + 1;
  return code.slice(start).search(/\S|$/u);
}

export function bracketBalance(line) {
  return (line.match(BRACKET_OPEN)?.length ?? 0) - (line.match(BRACKET_CLOSE)?.length ?? 0);
}

function expressionEnd(code, start, indent) {
  const lines = code.slice(start).split('\n');
  let depth = bracketBalance(lines[0]);
  let offset = start + lines[0].length + 1;
  for (const line of lines.slice(1)) {
    const indented = line.trim() === '' || line.search(/\S/u) > indent;
    if (depth <= 0 && !indented && !CONTINUATION_START.test(line)) {
      return offset - 1;
    }
    depth += bracketBalance(line);
    offset += line.length + 1;
  }
  return code.length;
}

function bodyStart(code, from) {
  let depth = 0;
  for (const [offset, char] of code.slice(from).split('').entries()) {
    const index = from + offset;
    const arrowTail = char === '>' && code[index - 1] === '-';
    if (depth === 0 && (char === '{' || char === '=')) {
      return index;
    }
    depth += '([<'.includes(char) ? 1 : 0;
    depth -= ')]>'.includes(char) && !arrowTail ? 1 : 0;
    if (char === '\n' && depth <= 0 && !'{=:'.includes(nextSignificant(code, index + 1) ?? ' ')) {
      return -1;
    }
  }
  return -1;
}

function functionBody(code, signatureEnd, indent) {
  const colon = /^\s*:/u.test(code.slice(signatureEnd));
  const mark = colon
    ? bodyStart(code, signatureEnd + code.slice(signatureEnd).indexOf(':') + 1)
    : signatureEnd + code.slice(signatureEnd).search(/\S|$/u);
  if (code[mark] === '{') {
    return { start: mark + 1, end: closingIndex(code, mark), expression: false };
  }
  return code[mark] === '='
    ? { start: mark + 1, end: expressionEnd(code, mark + 1, indent), expression: true }
    : undefined;
}

function functionAt(scanned, match) {
  const { code } = scanned;
  const name = FUNCTION_NAME.exec(match[1].trimEnd())?.[1];
  const open = match.index + match[0].length - 1;
  const body = functionBody(code, closingIndex(code, open) + 1, indentOf(code, match.index));
  if (name === undefined || body === undefined) {
    return [];
  }
  const annotations = annotationsBefore(scanned, match.index);
  return [{ name: simpleName(name), offset: match.index, annotations, body }];
}

export function functionsOf(scanned) {
  return [...scanned.code.matchAll(FUNCTION_KEYWORD)].flatMap((match) =>
    functionAt(scanned, match),
  );
}

export function enclosingClasses(classes, offset) {
  return classes
    .filter(({ bodyOpen, bodyClose }) => bodyOpen >= 0 && bodyOpen < offset && offset < bodyClose)
    .toSorted((left, right) => left.bodyOpen - right.bodyOpen);
}
