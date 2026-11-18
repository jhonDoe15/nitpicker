import { closingIndex } from '../kotlin/scan/kotlin-brackets.mts';
import {
  IDENTIFIER,
  bracePairs,
  closingAngle,
  declarationStartWith,
  docEntries,
  headerUntil,
  lineAt,
  lineStarts,
  matchesFrom,
  nameAtEnd,
  skipSpace,
  topLevelParts,
  withoutGenerics,
} from './doc-scopes.mts';
import { javadocText } from './javadoc-text.mts';
import type {
  DocComment,
  DocEntry,
  Declared,
  Header,
  Scope,
  TypeInfo,
} from './doc-comment-types.mts';

type DocPart = { kind: 'markdown' | 'javadoc'; text: string };
type Doc = DocPart & { start: number; end: number };

const TOKENS = new RegExp(
  [
    String.raw`"""(?:[^\\]|\\[\s\S])*?"""`,
    String.raw`"(?:[^"\\\n]|\\.)*"`,
    String.raw`'(?:[^'\\\n]|\\.)*'`,
    String.raw`\/\/[^\n]*`,
    String.raw`\/\*[\s\S]*?\*\/`,
  ].join('|'),
  'gu',
);
const TYPE = new RegExp(
  String.raw`(?<![\p{L}\p{N}_$.@])(?:@\s*(interface)|(class|interface|enum|record))\s+(${IDENTIFIER})`,
  'gu',
);
const ANNOTATION = new RegExp(String.raw`@\s*(?:${IDENTIFIER}(?:\s*\.\s*${IDENTIFIER})*)?`, 'uy');
const ANNOTATION_TYPE = /@\s*interface\b/uy;
const START_TOKEN = new RegExp(String.raw`@|non-sealed|${IDENTIFIER}|\S`, 'gu');
const MODIFIERS = new Set([
  'public',
  'protected',
  'private',
  'static',
  'final',
  'abstract',
  'native',
  'synchronized',
  'transient',
  'volatile',
  'strictfp',
  'default',
  'sealed',
  'non-sealed',
]);
const TYPE_KEYWORDS = new Set(['class', 'interface', 'enum', 'record']);
const RESERVED = new Set(['instanceof', 'extends', 'implements', 'permits', 'throws', 'new']);
const NOT_DECLARATIONS = new Set([
  'return',
  'throw',
  'new',
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'try',
  'assert',
  'yield',
  'package',
  'import',
  'module',
  'open',
  'this',
  'super',
]);
const HEADER = /^[\p{L}\p{N}_$.<>[\]?,&\s]+$/u;
const BODY_MARKS = /[({;]/gu;
const PARAMETER = new RegExp(String.raw`^([\s\S]*?)(${IDENTIFIER})((?:\s*\[\s*\])*)\s*$`, 'u');
const MARKDOWN_MARKER = '///';
const BLOCK_OPEN = '/*';
const BLOCK_CLOSE = '*/';

function blank(text: string): string {
  return text.replaceAll(/[^\n]/gu, ' ');
}

function maskedToken(token: string): string {
  if (token.startsWith('/')) {
    return blank(token);
  }
  const quote = token.startsWith('"""') ? '"""' : (token[0] ?? '');
  return `${quote}${blank(token.slice(quote.length, -quote.length))}${quote}`;
}

function isMarkdownLine(token: string): boolean {
  return token.startsWith(MARKDOWN_MARKER) && !token.startsWith(`${MARKDOWN_MARKER}/`);
}

function continuesMarkdown(source: string, last: Doc | undefined, index: number): boolean {
  return last?.kind === 'markdown' && /^[ \t]*\n[ \t]*$/u.test(source.slice(last.end, index));
}

function docOf(token: string): DocPart | undefined {
  if (isMarkdownLine(token)) {
    return { kind: 'markdown', text: token.slice(MARKDOWN_MARKER.length) };
  }
  const javadoc = token.startsWith(`${BLOCK_OPEN}*`) && !token.startsWith(`${BLOCK_OPEN}*/`);
  return javadoc
    ? { kind: 'javadoc', text: token.slice(BLOCK_OPEN.length, -BLOCK_CLOSE.length) }
    : undefined;
}

function readTokens(source: string): { code: string; docs: Doc[] } {
  const docs: Doc[] = [];
  const code = source.replaceAll(TOKENS, (token: string, index: number) => {
    const last = docs.at(-1);
    const doc = docOf(token);
    const end = index + token.length;
    if (doc?.kind === 'markdown' && last !== undefined && continuesMarkdown(source, last, index)) {
      Object.assign(last, { text: `${last.text}\n${doc.text}`, end });
    } else if (doc !== undefined) {
      docs.push({ ...doc, start: index, end });
    }
    return maskedToken(token);
  });
  return { code, docs };
}

function bodyOpen(code: string, from: number): number {
  let skipUntil = from;
  for (const { index, 0: mark } of matchesFrom(code, BODY_MARKS, from)) {
    if (index >= skipUntil && mark === '(') {
      skipUntil = closingIndex(code, index) + 1;
    } else if (index >= skipUntil) {
      return mark === '{' ? index : -1;
    }
  }
  return -1;
}

function isTypeName(code: string, match: RegExpExecArray): boolean {
  const after = skipSpace(code, match.index + match[0].length);
  const parameters = code[after] === '<' ? skipSpace(code, closingAngle(code, after) + 1) : after;
  return !RESERVED.has(match[3] ?? '') && (match[2] !== 'record' || code[parameters] === '(');
}

function typeBodies(code: string): Map<number, TypeInfo> {
  const types = new Map<number, TypeInfo>();
  for (const match of code.matchAll(TYPE)) {
    const open = isTypeName(code, match) ? bodyOpen(code, match.index + match[0].length) : -1;
    if (open >= 0) {
      types.set(open, { name: match[3] ?? '', kind: match[1] ?? match[2] });
    }
  }
  return types;
}

function afterAnnotation(code: string, at: number): number {
  ANNOTATION.lastIndex = at;
  const end = at + (ANNOTATION.exec(code)?.[0].length ?? 0);
  const next = skipSpace(code, end);
  return code[next] === '(' ? closingIndex(code, next) + 1 : end;
}

function isAnnotationType(code: string, at: number): boolean {
  ANNOTATION_TYPE.lastIndex = at;
  return ANNOTATION_TYPE.test(code);
}

function declarationStart(code: string, from: number): number {
  return declarationStartWith(code, from, {
    tokens: START_TOKEN,
    modifiers: MODIFIERS,
    startsAnnotationType: isAnnotationType,
    skipAnnotation: afterAnnotation,
  });
}

function withoutAnnotations(text: string): string {
  const kept: string[] = [];
  let start = 0;
  for (const { index } of text.matchAll(/@/gu)) {
    if (index >= start) {
      kept.push(text.slice(start, index));
      start = afterAnnotation(text, index);
    }
  }
  return [...kept, text.slice(start)].join(' ');
}

function parameterTypes(code: string, open: number): string {
  return topLevelParts(code.slice(open + 1, closingIndex(code, open)))
    .map((part) => {
      const plain = withoutAnnotations(part).replaceAll(/\bfinal\b/gu, ' ');
      const match = PARAMETER.exec(plain);
      const type = match === null ? plain : `${match[1] ?? ''}${match[3] ?? ''}`;
      return type.replaceAll(/\s+/gu, '');
    })
    .join(',');
}

function typeDeclaration(code: string, at: number): Declared | undefined {
  const match = new RegExp(TYPE.source, 'uy');
  match.lastIndex = at;
  const found = match.exec(code);
  return found === null || RESERVED.has(found[3] ?? '') ? undefined : { name: found[3] };
}

function memberKind(header: Header, scope: Scope): string | undefined {
  const text = withoutAnnotations(header.text);
  const words = withoutGenerics(text).trim().split(/\s+/u);
  const name = nameAtEnd(text);
  if (name === undefined || !HEADER.test(text) || NOT_DECLARATIONS.has(words[0] ?? '')) {
    return undefined;
  }
  const single = words.length === 1;
  if (single && scope.type?.kind === 'enum' && name !== scope.type.name) {
    return '(,;{}'.includes(header.stop) ? 'constant' : undefined;
  }
  if (single) {
    return name === scope.type?.name && '({'.includes(header.stop) ? 'constructor' : undefined;
  }
  if (header.stop === '(') {
    return 'method';
  }
  return ',;=}'.includes(header.stop) ? 'field' : undefined;
}

function memberDeclaration(code: string, at: number, scope: Scope): Declared | undefined {
  const header = headerUntil(code, at, '({;=,)}');
  const kind = memberKind(header, scope);
  if (kind === undefined) {
    return undefined;
  }
  const name = nameAtEnd(withoutAnnotations(header.text));
  const callable = kind === 'method' || (kind === 'constructor' && header.stop === '(');
  return callable ? { name, parameters: parameterTypes(code, header.at) } : { name };
}

function declarationAt(code: string, from: number, scope: Scope): Declared | undefined {
  const at = declarationStart(code, from);
  const [keyword] = matchesFrom(code, START_TOKEN, at);
  if (code[at] === '@' || TYPE_KEYWORDS.has(keyword?.[0] ?? '')) {
    return typeDeclaration(code, at);
  }
  return scope.type === undefined ? undefined : memberDeclaration(code, at, scope);
}

export function javaDocCommentEntries(source: string): DocEntry[] {
  const { code, docs } = readTokens(source);
  const context = { pairs: bracePairs(code), types: typeBodies(code) };
  const starts = lineStarts(source);
  return docs.flatMap((doc) =>
    docEntries(context, doc, {
      find: (scope) => declarationAt(code, doc.end, scope),
      input: ({ scope, declared }) => ({
        text: doc.kind === 'javadoc' ? javadocText(doc.text) : doc.text,
        line: lineAt(starts, doc.start),
        declared,
        chain: scope.chain,
      }),
    }),
  );
}

export function javaDocComments(source: string): DocComment[] {
  return javaDocCommentEntries(source).map(({ comment }) => comment);
}
