import { closingIndex } from '../kotlin/scan/kotlin-brackets.mts';
import { lineOf, scanKotlinSource } from '../kotlin/scan/kotlin-source.mts';
import {
  bracePairs,
  closingAngle,
  declarationStartWith,
  docEntries,
  headerUntil,
  matchesFrom,
  nameAtEnd,
  nameIndex,
  skipSpace,
  topLevelParts,
} from './doc-scopes.mts';
import type { DocComment, DocEntry, Declared, Scope, TypeInfo } from './doc-comment-types.mts';

type Extent = { readonly from: number; readonly to: number };
type Constructor = Extent & { readonly name: string };
type Member = { readonly keyword: string | undefined; readonly scope: Scope };

const OBJECT = 'object';
const COMPANION = 'companion';
const INTERFACE = 'interface';
const LETTER = String.raw`[\p{L}\p{N}_]`;
const NAME = String.raw`[\p{L}_]${LETTER}*|\x60[^\x60\n]+\x60`;
const TYPE = new RegExp(
  String.raw`(?<![\p{L}\p{N}_.@:])(?:companion\s+object(?:\s+(${NAME}))?|(enum\s+)?(class|interface|object)\s+(${NAME}))`,
  'gu',
);
const HEADER_KEYWORDS = [
  'fun',
  'val',
  'var',
  'class',
  'interface',
  'object',
  'typealias',
  'init',
  'companion',
  'import',
  'package',
  'enum',
  'data',
  'sealed',
  'abstract',
  'open',
  'override',
  'annotation',
  'inner',
  'value',
  'const',
  'lateinit',
  'suspend',
  'inline',
];
const BODY_STOP = new RegExp(
  String.raw`[({};=]|(?<![\p{L}\p{N}_.])(?:${HEADER_KEYWORDS.join('|')})(?![\p{L}\p{N}_.])`,
  'gu',
);
const ANNOTATION = new RegExp(String.raw`@(?:[A-Za-z]+:)?(?:${LETTER}+(?:\.${LETTER}+)*)?`, 'uy');
const START_TOKEN = new RegExp(String.raw`@|${NAME}|\S`, 'gu');
const WORD = new RegExp(NAME, 'uy');
const MODIFIERS = new Set([
  'public',
  'private',
  'protected',
  'internal',
  'open',
  'final',
  'abstract',
  'sealed',
  'data',
  'enum',
  'annotation',
  'inner',
  'value',
  'inline',
  'override',
  'suspend',
  'operator',
  'infix',
  'tailrec',
  'external',
  'const',
  'lateinit',
  'expect',
  'actual',
]);
const TYPE_KEYWORDS = new Set(['class', INTERFACE, OBJECT, 'typealias', COMPANION]);
const PROPERTY_HEADER = /^[\p{L}\p{N}_.`<>?,\s]+$/u;
const ACCESSOR_OR_DELEGATE = /\s+(?:by|get|set)\b[\s\S]*$/u;
const PARAMETER_ANNOTATION = new RegExp(
  String.raw`@(?:[A-Za-z]+:)?[\p{L}\p{N}_.]+(?:\([^()]*\))?`,
  'gu',
);
const KDOC_MARKER = /^\s*\*+/u;
const ENUM_ENTRY_END = ',;({}';
const COMPANION_OBJECT = /companion\s+object\s*/uy;

function unquoted(name: string): string {
  return name.replaceAll('`', '');
}

function typeExtent(code: string, from: number): { open: number; parameters: Extent | undefined } {
  let skipUntil = from;
  let parameters: Extent | undefined;
  for (const { index, 0: stop } of matchesFrom(code, BODY_STOP, from)) {
    if (index >= skipUntil && stop === '(') {
      skipUntil = closingIndex(code, index) + 1;
      parameters ??= { from: index, to: skipUntil - 1 };
    } else if (index >= skipUntil) {
      return { open: stop === '{' ? index : -1, parameters };
    }
  }
  return { open: -1, parameters };
}

function typeDeclarations(code: string): {
  types: Map<number, TypeInfo>;
  constructors: Constructor[];
} {
  const types = new Map<number, TypeInfo>();
  const constructors: Constructor[] = [];
  for (const match of code.matchAll(TYPE)) {
    const { open, parameters } = typeExtent(code, match.index + match[0].length);
    const type = {
      name: unquoted(match[4] ?? match[1] ?? 'Companion'),
      kind: match[2] === undefined ? (match[3] ?? OBJECT) : 'enum',
    };
    if (open >= 0) {
      types.set(open, type);
    }
    if (parameters !== undefined) {
      constructors.push({ ...parameters, name: type.name });
    }
  }
  return { types, constructors };
}

function constructorOwner(
  constructors: readonly Constructor[],
  offset: number,
): string | undefined {
  return constructors.findLast(({ from, to }) => from < offset && offset < to)?.name;
}

function wordAt(code: string, at: number): string | undefined {
  WORD.lastIndex = at;
  return WORD.exec(code)?.[0];
}

function afterAnnotation(code: string, at: number): number {
  ANNOTATION.lastIndex = at;
  const end = at + (ANNOTATION.exec(code)?.[0].length ?? 0);
  if (code[end] === '[') {
    return closingIndex(code, end) + 1;
  }
  return code[end] === '(' ? closingIndex(code, end) + 1 : end;
}

function declarationStart(code: string, from: number): number {
  return declarationStartWith(code, from, {
    tokens: START_TOKEN,
    modifiers: MODIFIERS,
    startsAnnotationType: () => false,
    skipAnnotation: afterAnnotation,
  });
}

function parameterTypes(code: string, open: number): string {
  return topLevelParts(code.slice(open + 1, closingIndex(code, open)))
    .map((part) => {
      const declared = part.replaceAll(PARAMETER_ANNOTATION, ' ');
      const colon = declared.indexOf(':');
      const type = colon < 0 ? declared : declared.slice(colon + 1);
      return topLevelParts(type.replaceAll('=', ',')).at(0)?.replaceAll(/\s+/gu, '') ?? '';
    })
    .join(',');
}

function afterGenerics(code: string, at: number): number {
  const next = skipSpace(code, at);
  return code[next] === '<' ? skipSpace(code, closingAngle(code, next) + 1) : next;
}

function typeDeclaration(code: string, at: number, keyword: string): Declared | undefined {
  if (keyword === COMPANION) {
    COMPANION_OBJECT.lastIndex = at;
    const name = COMPANION_OBJECT.test(code) ? wordAt(code, COMPANION_OBJECT.lastIndex) : undefined;
    return { name: name === undefined ? 'Companion' : unquoted(name) };
  }
  const name = wordAt(code, skipSpace(code, at + keyword.length));
  return name === undefined ? undefined : { name: unquoted(name) };
}

function receiverOf(text: string): string | undefined {
  const receiver = text.slice(0, nameIndex(text)).replace(/\.\s*$/u, '');
  return receiver.trim() === '' ? undefined : receiver.replaceAll(/\s+/gu, '');
}

function functionDeclaration(code: string, at: number): Declared | undefined {
  const header = headerUntil(code, afterGenerics(code, at), '({=;}\n');
  const name = header.stop === '(' ? nameAtEnd(header.text) : undefined;
  return name === undefined
    ? undefined
    : {
        name,
        receiver: receiverOf(header.text),
        parameters: parameterTypes(code, header.at),
      };
}

function propertyDeclaration(code: string, at: number): Declared | undefined {
  const header = headerUntil(code, afterGenerics(code, at), ':=;{}(\n');
  const text = header.text.replace(ACCESSOR_OR_DELEGATE, '');
  const name = PROPERTY_HEADER.test(text) ? nameAtEnd(text) : undefined;
  return name === undefined ? undefined : { name, receiver: receiverOf(text) };
}

function enumEntry(code: string, at: number, { keyword, scope }: Member): Declared | undefined {
  const end = skipSpace(code, at + (keyword?.length ?? 0));
  const entry = scope.type?.kind === 'enum' && keyword !== undefined && keyword !== 'init';
  return entry && (end === code.length || ENUM_ENTRY_END.includes(code[end] ?? ''))
    ? { name: unquoted(keyword) }
    : undefined;
}

function memberDeclaration(
  code: string,
  at: number,
  { keyword, scope }: Member,
): Declared | undefined {
  if (keyword === 'fun') {
    const next = skipSpace(code, at + keyword.length);
    return wordAt(code, next) === INTERFACE
      ? typeDeclaration(code, next, INTERFACE)
      : functionDeclaration(code, next);
  }
  if (keyword === 'val' || keyword === 'var') {
    return propertyDeclaration(code, at + keyword.length);
  }
  if (keyword !== 'constructor') {
    return enumEntry(code, at, { keyword, scope });
  }
  const open = skipSpace(code, at + keyword.length);
  return code[open] === '(' && scope.type !== undefined
    ? { name: scope.type.name, parameters: parameterTypes(code, open) }
    : undefined;
}

function declarationAt(code: string, from: number, scope: Scope): Declared | undefined {
  const at = declarationStart(code, from);
  const keyword = wordAt(code, at);
  return keyword !== undefined && TYPE_KEYWORDS.has(keyword)
    ? typeDeclaration(code, at, keyword)
    : memberDeclaration(code, at, { keyword, scope });
}

export function kotlinDocCommentEntries(source: string): DocEntry[] {
  const scanned = scanKotlinSource(source);
  const { code } = scanned;
  const { types, constructors } = typeDeclarations(code);
  const context = { pairs: bracePairs(code), types };
  return scanned.comments
    .filter(({ kind }) => kind === 'doc')
    .flatMap((doc) =>
      docEntries(context, doc, {
        find: (scope) => declarationAt(code, doc.end, scope),
        input: ({ scope, declared }) => {
          const owner = constructorOwner(constructors, doc.start);
          return {
            text: doc.text,
            marker: KDOC_MARKER,
            line: lineOf(scanned, doc.start),
            declared,
            chain: owner === undefined ? scope.chain : [...scope.chain, owner],
          };
        },
      }),
    );
}

export function kotlinDocComments(source: string): DocComment[] {
  return kotlinDocCommentEntries(source).map(({ comment }) => comment);
}
