import { blockCommentEnd, stringEnd } from './jvm-literals.mts';
import type { Token } from '../jvm-reuse-types.mts';

type Lexed = { readonly kind: string; readonly end: number };
type TokenParts = {
  readonly kind: string;
  readonly index: number;
  readonly end: number;
  readonly line: number;
  readonly kotlin: boolean;
};

const IDENTIFIER = /[\p{L}_$][\p{L}\p{N}_$]*|`[^`\n]+`/uy;
const NUMBER =
  /(?:0[xXbB]\w|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d)?|\.\d[\d_]*(?:[eE][+-]?\d)?)\w*/uy;
const OPERATOR =
  /(?:>>>=|<<=|>>=|\.\.\.|===|!==|\.\.<|\?\.|\?:|::|->|==|!=|<=|>=|&&|\|\||\+\+|--|[+\-*/%&|^]=|!!|\.\.|<<|[^\s\w])/uy;
const CHARACTER = /'(?:\\(?:u[\da-fA-F]{4}|.)|[^'\\\n])*'/uy;
const PATTERNS: readonly (readonly [string, RegExp])[] = [
  ['identifier', IDENTIFIER],
  ['number', NUMBER],
  ['char', CHARACTER],
  ['operator', OPERATOR],
];
const NON_SPACE = /\S/gu;
const TEMPLATE_NAME = /\$\{([^}]*)\}|\$([\p{L}_][\p{L}\p{N}_]*)/gu;
const NAME = /[\p{L}_$][\p{L}\p{N}_$]*/gu;
const QUOTED = /"(?:\\.|[^"\\])*"/gu;

function matchAt(pattern: RegExp, source: string, index: number): string | undefined {
  pattern.lastIndex = index;
  return pattern.exec(source)?.[0];
}

function nextNonSpace(source: string, at: number): number {
  NON_SPACE.lastIndex = at;
  return NON_SPACE.exec(source)?.index ?? -1;
}

function lineComment(source: string, index: number): number {
  const end = source.indexOf('\n', index);
  return end === -1 ? source.length : end;
}

function literalOrComment(source: string, index: number, kotlin: boolean): Lexed | undefined {
  if (source.startsWith('//', index)) {
    return { kind: 'comment', end: lineComment(source, index) };
  }
  if (source.startsWith('/*', index)) {
    return { kind: 'comment', end: blockCommentEnd(source, index, kotlin) };
  }
  return source[index] === '"'
    ? { kind: 'string', end: stringEnd(source, index, { kotlin }) }
    : undefined;
}

function nextToken(source: string, index: number, kotlin: boolean): Lexed {
  const literal = literalOrComment(source, index, kotlin);
  if (literal !== undefined) {
    return literal;
  }
  for (const [kind, pattern] of PATTERNS) {
    const text = matchAt(pattern, source, index);
    if (text !== undefined) {
      return { kind, end: index + text.length };
    }
  }
  return { kind: 'operator', end: index + 1 };
}

function lineNumbers(source: string): Int32Array {
  const lines = new Int32Array(source.length + 1);
  let offset = 0;
  for (const [number, text] of source.split('\n').entries()) {
    lines.fill(number + 1, offset, offset + text.length + 1);
    offset += text.length + 1;
  }
  return lines;
}

function templateNames(text: string): string[] {
  return [...text.matchAll(TEMPLATE_NAME)].flatMap(([, code, name]) =>
    name === undefined ? (code?.replaceAll(QUOTED, ' ').match(NAME) ?? []) : [name],
  );
}

export function namesOf(token: Token): readonly string[] {
  if (token.kind === 'identifier') {
    return [token.text];
  }
  return token.names ?? [];
}

function tokenOf(source: string, { kind, index, end, line, kotlin }: TokenParts): Token {
  const text = source.slice(index, end);
  const names = kotlin && kind === 'string' ? templateNames(text) : [];
  return { text, kind, line, ...(names.length === 0 ? {} : { names }) };
}

export function tokenizeJvm(
  source: string,
  { kotlin }: { kotlin: boolean } = { kotlin: false },
): Token[] {
  const lines = lineNumbers(source);
  const tokens: Token[] = [];

  const positions = [0];
  for (const at of positions) {
    const index = nextNonSpace(source, at);
    if (index === -1) {
      break;
    }
    const { kind, end } = nextToken(source, index, kotlin);
    if (kind !== 'comment') {
      tokens.push(tokenOf(source, { kind, index, end, line: lines[index] ?? 0, kotlin }));
    }
    positions.push(end);
  }
  return tokens;
}
