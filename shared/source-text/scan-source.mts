import { whileHolds } from '../traversal.mts';
import { canonicalString, delimitedEnd } from './strings/string-literals.mts';
import type {
  NewToken,
  ScanCursor,
  SourceLanguage,
  StringKind,
  StringLiteral,
  Token,
} from './typed/source-types.mts';

const SPACE = /[^\S\n]+/uy;
const NUMBER = /(?:\d|\.\d)[\p{L}\p{N}_]*(?:(?:(?<=[eE])[+-]|\.)\d[\p{L}\p{N}_]*)*/uy;
const WORD = /[\p{L}\p{N}_$]+/uy;
const REGEX_LITERAL = /\/(?:[^\\/[\n]|\\.|\[(?:[^\\\]\n]|\\.)*\])+\/\p{L}*/uy;
const CONTINUATION = /\\\r?\n/y;
const COMMENT_MARKER = /^(?:\/\*\*?|\/{2,}|#+)/u;
const BEFORE_REGEX = new Set([
  ...['return', 'typeof', 'case', 'do', 'else', 'in', 'instanceof', 'new', 'delete', 'void'],
  ...['throw', 'yield', 'await', 'of'],
]);
const AFTER_OPERAND = new Set([')', ']', '++', '--']);

function matchAt(pattern: RegExp, cursor: ScanCursor): RegExpExecArray | undefined {
  pattern.lastIndex = cursor.at;
  return pattern.exec(cursor.text) ?? undefined;
}

function push(cursor: ScanCursor, token: NewToken): void {
  cursor.tokens.push({ line: cursor.line, ...token });
  if (token.kind !== 'comment') {
    cursor.previous = cursor.tokens.at(-1);
  }
}

function readNewline(cursor: ScanCursor): boolean {
  if (cursor.text[cursor.at] !== '\n') {
    return false;
  }
  cursor.at += 1;
  cursor.line += 1;
  return true;
}

function readSpace(cursor: ScanCursor): boolean {
  const match = matchAt(SPACE, cursor);
  if (match === undefined) {
    return false;
  }
  cursor.at += match[0].length;
  return true;
}

function readContinuation(cursor: ScanCursor): boolean {
  if (cursor.language.name !== 'python') {
    return false;
  }
  const match = matchAt(CONTINUATION, cursor);
  if (match === undefined) {
    return false;
  }
  push(cursor, { kind: 'continuation', text: '\\' });
  cursor.at += match[0].length;
  cursor.line += 1;
  return true;
}

function commentWords(lineText: string, continued: boolean): string[] {
  const trimmed = lineText.trim();
  const marker = COMMENT_MARKER.exec(trimmed)?.[0] ?? '';
  const rest = trimmed.slice(marker.length);
  const words = rest.split(/\s+/u).filter((word) => word !== '');
  const [first] = words;
  if (continued && first?.startsWith('*') === true && first !== '*/') {
    words[0] = first.slice(1);
  }
  return [marker, ...words].filter((word) => word !== '').map((word) => `\u0001${word}`);
}

function pushComment(cursor: ScanCursor, raw: string): void {
  for (const [offset, lineText] of raw.split('\n').entries()) {
    for (const text of commentWords(lineText, offset > 0)) {
      push(cursor, { kind: 'comment', text, line: cursor.line + offset });
    }
  }
  cursor.line += raw.split('\n').length - 1;
  cursor.at += raw.length;
}

function blockCommentEnd(text: string, start: number, nested: boolean): number {
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

function readComment(cursor: ScanCursor): boolean {
  const { language, text, at } = cursor;
  if (text.startsWith(language.lineComment, at)) {
    const end = text.indexOf('\n', at);
    pushComment(cursor, text.slice(at, end === -1 ? text.length : end));
    return true;
  }
  if (language.blockComment === true && text.startsWith('/*', at)) {
    pushComment(
      cursor,
      text.slice(at, blockCommentEnd(text, at, language.nestedComments === true)),
    );
    return true;
  }
  return false;
}

function pushString(cursor: ScanCursor, literal: StringLiteral): void {
  const { raw, kind } = literal;
  const agnostic = cursor.language.quoteAgnostic === true && kind.template !== true;
  const text = agnostic ? canonicalString(raw, literal) : raw;
  if (kind.block !== true && !raw.includes('\n')) {
    push(cursor, { kind: 'string', text: `\0s${text}` });
    return;
  }
  for (const [offset, part] of text.split('\n').entries()) {
    const piece: NewToken = { kind: 'piece', text: `\0p${part}`, line: cursor.line + offset };
    push(cursor, {
      ...piece,
      ...(offset > 0 ? { joined: true as const } : {}),
      ...(kind.template === true ? { template: true as const } : {}),
    });
  }
  cursor.line += raw.split('\n').length - 1;
}

function stringKind(language: SourceLanguage, prefix: string, opener: string): StringKind {
  const kind = language.strings.kinds[opener];
  if (kind === undefined) {
    throw new Error(`Unknown string opener ${opener}`);
  }
  return /[ft]/iu.test(prefix) ? { ...kind, interpolation: '{', doubledBraces: true } : kind;
}

function readString(cursor: ScanCursor): boolean {
  const match = matchAt(cursor.language.strings.start, cursor);
  if (match === undefined) {
    return false;
  }
  const [whole] = match;
  const { prefix = '', opener = '' } = match.groups ?? {};
  const kind = stringKind(cursor.language, prefix, opener);
  const end = delimitedEnd(cursor.text, cursor.at + whole.length, kind);
  pushString(cursor, { raw: cursor.text.slice(cursor.at, end), prefix, opener, kind });
  cursor.at = end;
  return true;
}

function canonicalNumber(text: string, language: SourceLanguage): string {
  const lower = text.toLowerCase().replaceAll('_', '');
  const decimal = /^(?:[1-9]|0(?![\dbox])|\.)[\d.e+-]*$/u.test(lower);
  const value = language.name === 'javascript' && decimal ? Number(lower) : Number.NaN;
  return Number.isFinite(value) ? String(value) : text.toLowerCase();
}

function readPattern(pattern: RegExp, kind: 'number' | 'word'): (cursor: ScanCursor) => boolean {
  return (cursor) => {
    const match = matchAt(pattern, cursor);
    if (match === undefined) {
      return false;
    }
    const text = kind === 'number' ? canonicalNumber(match[0], cursor.language) : match[0];
    push(cursor, { kind, text });
    cursor.at += match[0].length;
    return true;
  };
}

const readNumber = readPattern(NUMBER, 'number');
const readWord = readPattern(WORD, 'word');

function regexAllowed(previous: Token | undefined, line: number): boolean {
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

function readRegex(cursor: ScanCursor): boolean {
  const allowed =
    cursor.language.regexLiterals === true &&
    cursor.text[cursor.at] === '/' &&
    regexAllowed(cursor.previous, cursor.line);
  if (!allowed) {
    return false;
  }
  const match = matchAt(REGEX_LITERAL, cursor);
  if (match === undefined) {
    return false;
  }
  push(cursor, { kind: 'regex', text: match[0] });
  cursor.at += match[0].length;
  return true;
}

function readOperator(cursor: ScanCursor): boolean {
  const text = matchAt(cursor.language.operators, cursor)?.[0];
  if (text === undefined) {
    return false;
  }
  push(cursor, { kind: 'op', text });
  cursor.at += text.length;
  return true;
}

const READERS: readonly ((cursor: ScanCursor) => boolean)[] = [
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

export function scanSource(text: string, language: SourceLanguage): Token[] {
  const cursor: ScanCursor = { text, at: 0, line: 1, tokens: [], language, previous: undefined };
  for (const current of whileHolds(cursor, ({ at }: ScanCursor) => at < text.length)) {
    READERS.find((read) => read(current));
  }
  return cursor.tokens;
}
