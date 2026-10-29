import { whileHolds } from '../traversal.mjs';

const SPACE = /[^\S\n]+/uy;
const NUMBER = /(?:\d|\.\d)[\p{L}\p{N}_]*(?:(?:(?<=[eE])[+-]|\.)\d[\p{L}\p{N}_]*)*/uy;
const WORD = /[\p{L}\p{N}_$]+/uy;
const REGEX_LITERAL = /\/(?:[^\\/[\n]|\\.|\[(?:[^\\\]\n]|\\.)*\])+\/\p{L}*/uy;
const CONTINUATION = /\\\r?\n/y;
const COMMENT_MARKER = /^(?:\/\*\*?|\/{2,}|#+)/u;
const BEFORE_REGEX = new Set([
  'return',
  'typeof',
  'case',
  'do',
  'else',
  'in',
  'instanceof',
  'new',
  'delete',
  'void',
  'throw',
  'yield',
  'await',
  'of',
]);
const AFTER_OPERAND = new Set([')', ']', '++', '--']);
const NESTED_QUOTES = new Set(["'", '"', '`']);

function matchAt(pattern, cursor) {
  pattern.lastIndex = cursor.at;
  return pattern.exec(cursor.text);
}

function push(cursor, token) {
  cursor.tokens.push({ line: cursor.line, ...token });
  if (token.kind !== 'comment') {
    cursor.previous = cursor.tokens.at(-1);
  }
}

function readNewline(cursor) {
  if (cursor.text[cursor.at] !== '\n') {
    return false;
  }
  cursor.at += 1;
  cursor.line += 1;
  return true;
}

function readSpace(cursor) {
  const match = matchAt(SPACE, cursor);
  if (match === null) {
    return false;
  }
  cursor.at += match[0].length;
  return true;
}

function readContinuation(cursor) {
  if (cursor.language.name !== 'python') {
    return false;
  }
  const match = matchAt(CONTINUATION, cursor);
  if (match === null) {
    return false;
  }
  push(cursor, { kind: 'continuation', text: '\\' });
  cursor.at += match[0].length;
  cursor.line += 1;
  return true;
}

function commentWords(lineText, continued) {
  const trimmed = lineText.trim();
  const marker = COMMENT_MARKER.exec(trimmed)?.[0] ?? '';
  const rest = trimmed.slice(marker.length);
  const words = rest.split(/\s+/u).filter((word) => word !== '');
  if (continued && words[0]?.startsWith('*') && words[0] !== '*/') {
    words[0] = words[0].slice(1);
  }
  return [marker, ...words].filter((word) => word !== '').map((word) => `\u0001${word}`);
}

function pushComment(cursor, raw) {
  for (const [offset, lineText] of raw.split('\n').entries()) {
    for (const text of commentWords(lineText, offset > 0)) {
      push(cursor, { kind: 'comment', text, line: cursor.line + offset });
    }
  }
  cursor.line += raw.split('\n').length - 1;
  cursor.at += raw.length;
}

function blockCommentEnd(text, start, nested) {
  const delimiters = /\/\*|\*\//gu;
  delimiters.lastIndex = start + 2;
  const state = { depth: 1 };
  for (const match of text.matchAll(delimiters)) {
    state.depth += match[0] === '/*' && nested ? 1 : 0;
    state.depth -= match[0] === '*/' ? 1 : 0;
    if (state.depth === 0) {
      return match.index + 2;
    }
  }
  return text.length;
}

function readComment(cursor) {
  const { language, text, at } = cursor;
  if (text.startsWith(language.lineComment, at)) {
    const end = text.indexOf('\n', at);
    pushComment(cursor, text.slice(at, end === -1 ? text.length : end));
    return true;
  }
  if (language.blockComment === true && text.startsWith('/*', at)) {
    pushComment(cursor, text.slice(at, blockCommentEnd(text, at, language.nestedComments)));
    return true;
  }
  return false;
}

function outsideStep(text, state, kind) {
  const char = text[state.at];
  if (char === '\\' && kind.escapes) {
    state.at += 2;
    return false;
  }
  if (text.startsWith(kind.close, state.at)) {
    state.at += kind.close.length;
    return true;
  }
  if (char === '\n' && !kind.multiline) {
    return true;
  }
  const opens = kind.interpolation !== undefined && text.startsWith(kind.interpolation, state.at);
  const doubled = kind.doubledBraces === true && text.startsWith('{{', state.at);
  state.depth = opens && !doubled ? 1 : 0;
  state.at += opens ? kind.interpolation.length + Number(doubled) : 1;
  return false;
}

function nestedEnd(text, at) {
  const quote = text[at];
  return delimitedEnd(text, at + 1, {
    close: quote,
    multiline: quote === '`',
    escapes: true,
    interpolation: quote === '`' ? '${' : undefined,
  });
}

function insideStep(text, state, kind) {
  const char = text[state.at];
  if (char === '\n' && !kind.multiline) {
    return true;
  }
  state.depth += Number(char === '{') - Number(char === '}');
  state.at = NESTED_QUOTES.has(char) ? nestedEnd(text, state.at) : state.at + 1;
  return false;
}

function delimitedEnd(text, start, kind) {
  const state = { at: start, depth: 0 };
  for (const current of whileHolds(state, ({ at }) => at < text.length)) {
    const step = current.depth > 0 ? insideStep : outsideStep;
    if (step(text, current, kind)) {
      return Math.min(state.at, text.length);
    }
  }
  return text.length;
}

function unescapedQuotes(body) {
  return body.replaceAll(/\\([\s\S])/gu, (escape, char) =>
    char === '"' || char === "'" ? char : escape,
  );
}

function canonicalString(raw, { prefix, opener, kind }) {
  const start = prefix.length + opener.length;
  const terminated = raw.length >= start + kind.close.length && raw.endsWith(kind.close);
  const body = raw.slice(start, terminated ? raw.length - kind.close.length : raw.length);
  const quote = kind.block === true ? '"""' : '"';
  const value = kind.block === true || /r/iu.test(prefix) ? body : unescapedQuotes(body);
  const letters = [...prefix.toLowerCase()].filter((letter) => letter !== 'u').toSorted();
  return `${letters.join('')}${quote}${value}${terminated ? quote : '\0'}`;
}

function pushString(cursor, literal) {
  const { raw, kind } = literal;
  const agnostic = cursor.language.quoteAgnostic === true && kind.template !== true;
  const text = agnostic ? canonicalString(raw, literal) : raw;
  if (kind.block !== true && !raw.includes('\n')) {
    push(cursor, { kind: 'string', text: `\0s${text}` });
    return;
  }
  for (const [offset, part] of text.split('\n').entries()) {
    const piece = { kind: 'piece', text: `\0p${part}`, line: cursor.line + offset };
    push(cursor, { ...piece, joined: offset > 0, template: kind.template === true });
  }
  cursor.line += raw.split('\n').length - 1;
}

function stringKind(language, prefix, opener) {
  const kind = language.strings.kinds[opener];
  return /[ft]/iu.test(prefix) ? { ...kind, interpolation: '{', doubledBraces: true } : kind;
}

function readString(cursor) {
  const match = matchAt(cursor.language.strings.start, cursor);
  if (match === null) {
    return false;
  }
  const [whole, prefix, opener] = match;
  const kind = stringKind(cursor.language, prefix, opener);
  const end = delimitedEnd(cursor.text, cursor.at + whole.length, kind);
  pushString(cursor, { raw: cursor.text.slice(cursor.at, end), prefix, opener, kind });
  cursor.at = end;
  return true;
}

function canonicalNumber(text, language) {
  const lower = text.toLowerCase().replaceAll('_', '');
  const decimal = /^(?:[1-9]|0(?![\dbox])|\.)[\d.e+-]*$/u.test(lower);
  const value = language.name === 'javascript' && decimal ? Number(lower) : Number.NaN;
  return Number.isFinite(value) ? String(value) : text.toLowerCase();
}

function readNumber(cursor) {
  const match = matchAt(NUMBER, cursor);
  if (match === null) {
    return false;
  }
  push(cursor, { kind: 'number', text: canonicalNumber(match[0], cursor.language) });
  cursor.at += match[0].length;
  return true;
}

function readWord(cursor) {
  const match = matchAt(WORD, cursor);
  if (match === null) {
    return false;
  }
  push(cursor, { kind: 'word', text: match[0] });
  cursor.at += match[0].length;
  return true;
}

function regexAllowed(previous, line) {
  if (previous === undefined) {
    return true;
  }
  if (previous.kind === 'word') {
    return BEFORE_REGEX.has(previous.text);
  }
  if (previous.kind !== 'op') {
    return false;
  }
  return previous.text === '}' ? previous.line < line : !AFTER_OPERAND.has(previous.text);
}

function readRegex(cursor) {
  const allowed =
    cursor.language.regexLiterals === true &&
    cursor.text[cursor.at] === '/' &&
    regexAllowed(cursor.previous, cursor.line);
  if (!allowed) {
    return false;
  }
  const match = matchAt(REGEX_LITERAL, cursor);
  if (match === null) {
    return false;
  }
  push(cursor, { kind: 'regex', text: match[0] });
  cursor.at += match[0].length;
  return true;
}

function readOperator(cursor) {
  const [text] = matchAt(cursor.language.operators, cursor);
  push(cursor, { kind: 'op', text });
  cursor.at += text.length;
  return true;
}

const READERS = [
  readNewline,
  readSpace,
  readContinuation,
  readComment,
  readString,
  readNumber,
  readWord,
  readRegex,
  readOperator,
];

export function scanSource(text, language) {
  const cursor = { text, at: 0, line: 1, tokens: [], language, previous: undefined };
  for (const current of whileHolds(cursor, ({ at }) => at < text.length)) {
    READERS.find((read) => read(current));
  }
  return cursor.tokens;
}
