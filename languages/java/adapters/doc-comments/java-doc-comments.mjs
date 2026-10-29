import { closingIndex } from '../kotlin/scan/kotlin-brackets.mjs';
import {
  bracePairs,
  docComment,
  headerUntil,
  lineAt,
  lineStarts,
  nameAtEnd,
  scopeAt,
  skipSpace,
  topLevelParts,
  withoutGenerics,
} from './doc-scopes.mjs';

const TOKENS =
  /"""(?:[^\\]|\\[\s\S])*?"""|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\/\/[^\n]*|\/\*[\s\S]*?\*\//gu;
const TYPE = /(?<![\w$.@])(?:@\s*(interface)|(class|interface|enum|record))\s+([A-Za-z_$][\w$]*)/gu;
const ANNOTATION = /@\s*[\w$]+(?:\s*\.\s*[\w$]+)*/uy;
const WORD = /non-sealed|[A-Za-z_$][\w$]*/uy;
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
const HEADER = /^[\w$.<>[\]?,&\s]+$/u;
const HTML_TAG =
  /<\/?(?:p|br|ul|ol|li|b|i|u|em|strong|code|a|h[1-6]|table|thead|tbody|tr|td|th|div|span|blockquote|dl|dt|dd|sup|sub|tt|hr|img|small|big|caption)\b[^>]*>/giu;
const PRE_OPEN = /<pre\b[^>]*>/iu;
const PRE_CLOSE = /<\/pre\s*>/iu;
const ENTITY = /&#?\w+;/gu;
const FENCE = '```';
const JAVADOC_MARKER = /^\s*\*+/u;

function blank(text) {
  return text.replaceAll(/[^\n]/gu, ' ');
}

function maskedToken(token) {
  if (token.startsWith('/')) {
    return blank(token);
  }
  const quote = token.startsWith('"""') ? '"""' : token[0];
  return `${quote}${blank(token.slice(quote.length, -quote.length))}${quote}`;
}

function isMarkdownLine(token) {
  return token.startsWith('///') && !token.startsWith('////');
}

function continuesMarkdown(source, last, index) {
  return last?.kind === 'markdown' && /^[ \t]*\n[ \t]*$/u.test(source.slice(last.end, index));
}

function readTokens(source) {
  const docs = [];
  const code = source.replaceAll(TOKENS, (token, index) => {
    const last = docs.at(-1);
    if (isMarkdownLine(token) && continuesMarkdown(source, last, index)) {
      last.text += `\n${token.slice(3)}`;
      last.end = index + token.length;
    } else if (isMarkdownLine(token)) {
      docs.push({
        kind: 'markdown',
        start: index,
        end: index + token.length,
        text: token.slice(3),
      });
    } else if (token.startsWith('/**') && !token.startsWith('/**/')) {
      docs.push({
        kind: 'javadoc',
        start: index,
        end: index + token.length,
        text: token.slice(2, -2),
      });
    }
    return maskedToken(token);
  });
  return { code, docs };
}

function bodyOpen(code, from) {
  for (let index = from; index < code.length; index += 1) {
    if (code[index] === '(') {
      index = closingIndex(code, index);
    } else if (code[index] === '{') {
      return index;
    } else if (code[index] === ';') {
      return -1;
    }
  }
  return -1;
}

function typeBodies(code) {
  const types = new Map();
  for (const match of code.matchAll(TYPE)) {
    const open = bodyOpen(code, match.index + match[0].length);
    if (open >= 0) {
      types.set(open, { name: match[3], kind: match[1] ?? match[2] });
    }
  }
  return types;
}

function wordAt(code, at) {
  WORD.lastIndex = at;
  return WORD.exec(code)?.[0];
}

function afterAnnotation(code, at) {
  ANNOTATION.lastIndex = at;
  const end = at + ANNOTATION.exec(code)[0].length;
  const next = skipSpace(code, end);
  return code[next] === '(' ? closingIndex(code, next) + 1 : end;
}

function declarationStart(code, from) {
  let at = skipSpace(code, from);
  for (;;) {
    const word = wordAt(code, at);
    if (code[at] === '@' && !/^@\s*interface\b/u.test(code.slice(at, at + 40))) {
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
    .map((part) =>
      part
        .replaceAll(/@\s*[\w$.]+(?:\s*\([^()]*\))?/gu, ' ')
        .replaceAll(/\bfinal\b/gu, ' ')
        .replace(/[A-Za-z_$][\w$]*(?:\s*\[\s*\])*\s*$/u, '')
        .replaceAll(/\s+/gu, ''),
    )
    .join(',');
}

function typeDeclaration(code, at) {
  const match = new RegExp(TYPE.source, 'uy');
  match.lastIndex = at;
  const found = match.exec(code);
  return found === null ? undefined : { name: found[3] };
}

function memberKind(header, scope) {
  const words = withoutGenerics(header.text).trim().split(/\s+/u);
  const name = nameAtEnd(header.text);
  if (name === undefined || !HEADER.test(header.text) || NOT_DECLARATIONS.has(words[0])) {
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

function declarationAt(code, from, scope) {
  const at = declarationStart(code, from);
  const keyword = wordAt(code, at);
  if (code[at] === '@' || TYPE_KEYWORDS.has(keyword)) {
    return typeDeclaration(code, at);
  }
  if (scope.type === undefined) {
    return undefined;
  }
  const header = headerUntil(code, at, '({;=,)}');
  const kind = memberKind(header, scope);
  if (kind === undefined) {
    return undefined;
  }
  const name = nameAtEnd(header.text);
  const callable = kind === 'method' || (kind === 'constructor' && header.stop === '(');
  return callable ? { name, parameters: parameterTypes(code, header.at) } : { name };
}

function javadocText(text) {
  let insidePre = false;
  return text
    .split('\n')
    .flatMap((raw) => {
      const line = raw.replace(JAVADOC_MARKER, '');
      if (!insidePre && PRE_OPEN.test(line)) {
        insidePre = !PRE_CLOSE.test(line.slice(line.search(PRE_OPEN)));
        return insidePre ? [FENCE] : [];
      }
      if (insidePre && PRE_CLOSE.test(line)) {
        insidePre = false;
        return [FENCE];
      }
      return [insidePre ? line : line.replaceAll(HTML_TAG, ' ').replaceAll(ENTITY, ' ')];
    })
    .join('\n');
}

export function javaDocComments(source) {
  const { code, docs } = readTokens(source);
  const context = { pairs: bracePairs(code), types: typeBodies(code) };
  const starts = lineStarts(source);
  return docs.flatMap((doc) => {
    const scope = scopeAt(context, doc.start);
    const declared = scope.declarable ? declarationAt(code, doc.end, scope) : undefined;
    if (declared === undefined) {
      return [];
    }
    const text = doc.kind === 'javadoc' ? javadocText(doc.text) : doc.text;
    return [docComment({ text, line: lineAt(starts, doc.start), declared, chain: scope.chain })];
  });
}
