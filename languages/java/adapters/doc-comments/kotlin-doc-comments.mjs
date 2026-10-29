import { closingIndex } from '../kotlin/scan/kotlin-brackets.mjs';
import { lineOf, scanKotlinSource } from '../kotlin/scan/kotlin-source.mjs';
import {
  bracePairs,
  closingAngle,
  docComment,
  headerUntil,
  nameAtEnd,
  scopeAt,
  skipSpace,
  topLevelParts,
} from './doc-scopes.mjs';

const NAME = String.raw`(?:[A-Za-z_]\w*|\x60[^\x60\n]+\x60)`;
const TYPE = new RegExp(
  String.raw`(?<![\w.@:])(?:companion\s+object(?:\s+(${NAME}))?|(class|interface|object)\s+(${NAME}))`,
  'gu',
);
const BODY_STOP =
  /[({};=]|\b(?:fun|val|var|class|interface|object|typealias|init|companion|import|package|enum|data|sealed|abstract|open|override|annotation|inner|value|const|lateinit|suspend|inline)\b/gu;
const ANNOTATION = /@(?:[A-Za-z]+:)?/uy;
const ANNOTATION_NAME = /[\w.]+/uy;
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
const PROPERTY_HEADER = /^[\w.`<>?,\s]+$/u;
const ACCESSOR_OR_DELEGATE = /\s+(?:by|get|set)\b[\s\S]*$/u;
const KDOC_MARKER = /^\s*\*+/u;
const ENUM_ENTRY_END = ',;({}';

function unquoted(name) {
  return name.replaceAll('`', '');
}

function typeExtent(code, from) {
  const stops = new RegExp(BODY_STOP.source, 'gu');
  stops.lastIndex = from;
  let parameters;
  for (let stop = stops.exec(code); stop !== null; stop = stops.exec(code)) {
    if (stop[0] === '(') {
      const close = closingIndex(code, stop.index);
      parameters ??= { from: stop.index, to: close };
      stops.lastIndex = close + 1;
    } else {
      return { open: stop[0] === '{' ? stop.index : -1, parameters };
    }
  }
  return { open: -1, parameters };
}

function typeDeclarations(code) {
  const types = new Map();
  const constructors = [];
  for (const match of code.matchAll(TYPE)) {
    const { open, parameters } = typeExtent(code, match.index + match[0].length);
    const enumClass = /\benum\s+$/u.test(code.slice(Math.max(0, match.index - 20), match.index));
    const type = {
      name: unquoted(match[3] ?? match[1] ?? 'Companion'),
      kind: enumClass ? 'enum' : (match[2] ?? 'object'),
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
  const target = at + ANNOTATION.exec(code)[0].length;
  if (code[target] === '[') {
    return closingIndex(code, target) + 1;
  }
  ANNOTATION_NAME.lastIndex = target;
  const end = target + (ANNOTATION_NAME.exec(code)?.[0].length ?? 0);
  return code[end] === '(' ? closingIndex(code, end) + 1 : end;
}

function declarationStart(code, from) {
  let at = skipSpace(code, from);
  for (;;) {
    const word = wordAt(code, at);
    if (code[at] === '@') {
      at = skipSpace(code, afterAnnotation(code, at));
    } else if (MODIFIERS.has(word)) {
      at = skipSpace(code, at + word.length);
    } else {
      return at;
    }
  }
}

function parameterTypes(code, open) {
  return topLevelParts(code.slice(open + 1, closingIndex(code, open)))
    .map((part) => {
      const declared = part.replaceAll(/@(?:[A-Za-z]+:)?[\w.]+(?:\([^()]*\))?/gu, ' ');
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
    const name = wordAt(
      code,
      skipSpace(code, skipSpace(code, at + keyword.length) + 'object'.length),
    );
    return { name: name === undefined ? 'Companion' : unquoted(name) };
  }
  const name = wordAt(code, skipSpace(code, at + keyword.length));
  return name === undefined ? undefined : { name: unquoted(name) };
}

function functionDeclaration(code, at) {
  const header = headerUntil(code, afterGenerics(code, at), '({=;}\n');
  const name = header.stop === '(' ? nameAtEnd(header.text) : undefined;
  return name === undefined ? undefined : { name, parameters: parameterTypes(code, header.at) };
}

function propertyDeclaration(code, at) {
  const header = headerUntil(code, afterGenerics(code, at), ':=;{}(\n');
  const text = header.text.replace(ACCESSOR_OR_DELEGATE, '');
  if (!PROPERTY_HEADER.test(text)) {
    return undefined;
  }
  const name = nameAtEnd(text);
  return name === undefined ? undefined : { name };
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
  if (keyword === 'constructor' && scope.type !== undefined) {
    const open = skipSpace(code, at + keyword.length);
    return code[open] === '('
      ? { name: scope.type.name, parameters: parameterTypes(code, open) }
      : undefined;
  }
  const end = skipSpace(code, at + (keyword?.length ?? 0));
  const entry = scope.type?.kind === 'enum' && keyword !== undefined && keyword !== 'init';
  return entry && (end === code.length || ENUM_ENTRY_END.includes(code[end]))
    ? { name: unquoted(keyword) }
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
      return [
        docComment({
          text: doc.text,
          marker: KDOC_MARKER,
          line: lineOf(scanned, doc.start),
          declared,
          chain: [...scope.chain, constructorOwner(constructors, doc.start)].filter(Boolean),
        }),
      ];
    });
}
