import { closingIndex } from '../kotlin/scan/kotlin-brackets.mjs';
import { lineOf, scanKotlinSource } from '../kotlin/scan/kotlin-source.mjs';
import {
  bracePairs,
  closingAngle,
  docComment,
  headerUntil,
  matchesFrom,
  nameAtEnd,
  nameIndex,
  scopeAt,
  skipSpace,
  topLevelParts,
} from './doc-scopes.mjs';

const LETTER = String.raw`[\p{L}\p{N}_]`;
const NAME = String.raw`(?:[\p{L}_]${LETTER}*|\x60[^\x60\n]+\x60)`;
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
const TYPE_KEYWORDS = new Set(['class', 'interface', 'object', 'typealias', 'companion']);
const PROPERTY_HEADER = /^[\p{L}\p{N}_.`<>?,\s]+$/u;
const ACCESSOR_OR_DELEGATE = /\s+(?:by|get|set)\b[\s\S]*$/u;
const PARAMETER_ANNOTATION = new RegExp(
  String.raw`@(?:[A-Za-z]+:)?[\p{L}\p{N}_.]+(?:\([^()]*\))?`,
  'gu',
);
const KDOC_MARKER = /^\s*\*+/u;
const ENUM_ENTRY_END = ',;({}';
const COMPANION_OBJECT = /companion\s+object\s*/uy;

function unquoted(name) {
  return name.replaceAll('`', '');
}

function typeExtent(code, from) {
  let skipUntil = from;
  let parameters;
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

function typeDeclarations(code) {
  const types = new Map();
  const constructors = [];
  for (const match of code.matchAll(TYPE)) {
    const { open, parameters } = typeExtent(code, match.index + match[0].length);
    const type = {
      name: unquoted(match[4] ?? match[1] ?? 'Companion'),
      kind: match[2] === undefined ? (match[3] ?? 'object') : 'enum',
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

function constructorOwner(constructors, offset) {
  return constructors.findLast(({ from, to }) => from < offset && offset < to)?.name;
}

function wordAt(code, at) {
  WORD.lastIndex = at;
  return WORD.exec(code)?.[0];
}

function afterAnnotation(code, at) {
  ANNOTATION.lastIndex = at;
  const end = at + ANNOTATION.exec(code)[0].length;
  if (code[end] === '[') {
    return closingIndex(code, end) + 1;
  }
  return code[end] === '(' ? closingIndex(code, end) + 1 : end;
}

function declarationStart(code, from) {
  let skipUntil = from;
  for (const { index, 0: token } of matchesFrom(code, START_TOKEN, from)) {
    if (index < skipUntil || MODIFIERS.has(token)) {
      continue;
    }
    if (token !== '@') {
      return index;
    }
    skipUntil = afterAnnotation(code, index);
  }
  return code.length;
}

function parameterTypes(code, open) {
  return topLevelParts(code.slice(open + 1, closingIndex(code, open)))
    .map((part) => {
      const declared = part.replaceAll(PARAMETER_ANNOTATION, ' ');
      const colon = declared.indexOf(':');
      const type = colon < 0 ? declared : declared.slice(colon + 1);
      return topLevelParts(type.replaceAll('=', ',')).at(0)?.replaceAll(/\s+/gu, '') ?? '';
    })
    .join(',');
}

function afterGenerics(code, at) {
  const next = skipSpace(code, at);
  return code[next] === '<' ? skipSpace(code, closingAngle(code, next) + 1) : next;
}

function typeDeclaration(code, at, keyword) {
  if (keyword === 'companion') {
    COMPANION_OBJECT.lastIndex = at;
    const name = COMPANION_OBJECT.test(code) ? wordAt(code, COMPANION_OBJECT.lastIndex) : undefined;
    return { name: name === undefined ? 'Companion' : unquoted(name) };
  }
  const name = wordAt(code, skipSpace(code, at + keyword.length));
  return name === undefined ? undefined : { name: unquoted(name) };
}

function receiverOf(text) {
  const receiver = text.slice(0, nameIndex(text)).replace(/\.\s*$/u, '');
  return receiver.trim() === '' ? undefined : receiver.replaceAll(/\s+/gu, '');
}

function functionDeclaration(code, at) {
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

function propertyDeclaration(code, at) {
  const header = headerUntil(code, afterGenerics(code, at), ':=;{}(\n');
  const text = header.text.replace(ACCESSOR_OR_DELEGATE, '');
  const name = PROPERTY_HEADER.test(text) ? nameAtEnd(text) : undefined;
  return name === undefined ? undefined : { name, receiver: receiverOf(text) };
}

function enumEntry(code, at, { keyword, scope }) {
  const end = skipSpace(code, at + (keyword?.length ?? 0));
  const entry = scope.type?.kind === 'enum' && keyword !== undefined && keyword !== 'init';
  return entry && (end === code.length || ENUM_ENTRY_END.includes(code[end]))
    ? { name: unquoted(keyword) }
    : undefined;
}

function memberDeclaration(code, at, { keyword, scope }) {
  if (keyword === 'fun') {
    const next = skipSpace(code, at + keyword.length);
    return wordAt(code, next) === 'interface'
      ? typeDeclaration(code, next, 'interface')
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

function declarationAt(code, from, scope) {
  const at = declarationStart(code, from);
  const keyword = wordAt(code, at);
  return TYPE_KEYWORDS.has(keyword)
    ? typeDeclaration(code, at, keyword)
    : memberDeclaration(code, at, { keyword, scope });
}

export function kotlinDocComments(source) {
  const scanned = scanKotlinSource(source);
  const { code } = scanned;
  const { types, constructors } = typeDeclarations(code);
  const context = { pairs: bracePairs(code), types };
  return scanned.comments
    .filter(({ kind }) => kind === 'doc')
    .flatMap((doc) => {
      const scope = scopeAt(context, doc.start);
      const declared = scope.declarable ? declarationAt(code, doc.end, scope) : undefined;
      if (declared === undefined) {
        return [];
      }
      const owner = constructorOwner(constructors, doc.start);
      return [
        docComment({
          text: doc.text,
          marker: KDOC_MARKER,
          line: lineOf(scanned, doc.start),
          declared,
          chain: owner === undefined ? scope.chain : [...scope.chain, owner],
        }),
      ];
    });
}
