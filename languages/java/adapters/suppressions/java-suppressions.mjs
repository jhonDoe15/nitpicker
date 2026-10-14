import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { hash, nextOccurrence } from '../../../../shared/rules/finding-helpers.mjs';

const INLINE_SUPPRESSION_RULE = 'InlineSuppression';
const INLINE_SUPPRESSIBLE_RULES = ['PMD.SpringDataNativeQuery'];

const LITERALS_AND_COMMENTS =
  /"""(?:[^\\]|\\[\s\S])*?"""|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\/\/[^\n]*|\/\*[\s\S]*?\*\//g;
const SUPPRESS_WARNINGS = /@(?:java\.lang\.)?SuppressWarnings\s*\(/g;
const STRING_LITERAL = /"((?:[^"\\]|\\.)*)"/g;
const UNICODE_ESCAPE = /\\u+([0-9a-fA-F]{4})/g;
const NESTED_PARENTHESES = /(\([^()]*)\([^()]*\)/g;
const ANNOTATION = /@[\w.]+(?:\s*\([^()]*\))?/g;
const LITERAL_ARGUMENTS = /^\s*(?:value\s*=)?[\s{},"]*$/;
const PMD_WARNING_NAMES = new Set(['all', 'unused', 'serial', 'fallthrough']);
const MESSAGE =
  'Do not silence PMD inline: fix the finding, or add an exception for its rule in nitpicker.config.json. PMD also honors "all", "unused", "serial" and "fallthrough". The one accepted marker is @SuppressWarnings("PMD.SpringDataNativeQuery") on a repository method that needs native SQL.';

export function readInlineSuppressionFindings(projectRoot, sourceRoots) {
  return sourceRoots.flatMap((sourceRoot) =>
    javaFiles(path.join(projectRoot, sourceRoot)).flatMap((file) =>
      fileFindings(
        readFileSync(file, 'utf8'),
        path.relative(projectRoot, file).split(path.sep).join('/'),
      ),
    ),
  );
}

function javaFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.java'))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
}

export function fileFindings(source, filePath) {
  const views = sourceViews(
    source.replace(UNICODE_ESCAPE, (_, code) => String.fromCodePoint(Number.parseInt(code, 16))),
  );
  const occurrences = new Map();
  return annotationSuppressions(views).map(({ offset, found }) => {
    const key = `${found}\0${declarationAfter(views.code, offset)}\0${lineText(views.code, offset)}`;
    const occurrence = nextOccurrence(occurrences, key);
    return {
      tool: 'pmd',
      rule: INLINE_SUPPRESSION_RULE,
      path: filePath,
      identity: `${INLINE_SUPPRESSION_RULE}:${hash(key)}${occurrence === 1 ? '' : `#${String(occurrence)}`}`,
      message: `${MESSAGE} Found: ${found}.`,
      classification: 'enforceable',
      location: { line: lineOf(views.code, offset) },
    };
  });
}

function sourceViews(source) {
  const code = source.replace(LITERALS_AND_COMMENTS, (token) =>
    isComment(token) ? blank(token) : `${token[0]}${blank(token.slice(1, -1))}${token.at(-1)}`,
  );
  const withoutComments = source.replace(LITERALS_AND_COMMENTS, (token) =>
    isComment(token) ? blank(token) : token,
  );
  return { code, withoutComments };
}

function isComment(token) {
  return token.startsWith('/');
}

function blank(text) {
  return text.replace(/[^\n]/g, ' ');
}

function annotationSuppressions({ code, withoutComments }) {
  return [...code.matchAll(SUPPRESS_WARNINGS)].flatMap((match) => {
    const start = match.index + match[0].length;
    const end = code.indexOf(')', start);
    const values = [...withoutComments.slice(start, end).matchAll(STRING_LITERAL)].map(
      ([, value]) => value,
    );
    if (!LITERAL_ARGUMENTS.test(code.slice(start, end))) {
      return [{ offset: match.index, found: 'a constant expression' }];
    }
    const silencesPmd = values.filter(
      (value) => PMD_WARNING_NAMES.has(value) || /^PMD(?:\.|$)/.test(value),
    );
    return silencesPmd.length === 0 || isAcceptedMarker(silencesPmd, code, end + 1)
      ? []
      : [{ offset: match.index, found: silencesPmd.map((value) => `"${value}"`).join(', ') }];
  });
}

function isAcceptedMarker(silencesPmd, code, offset) {
  return (
    silencesPmd.every((value) => INLINE_SUPPRESSIBLE_RULES.includes(value)) &&
    isMethodDeclaration(declarationAfter(code, offset))
  );
}

function declarationAfter(code, offset) {
  const rest = code.slice(offset);
  const end = rest.search(/[{;]/);
  return withoutNestedParentheses(end === -1 ? rest : rest.slice(0, end))
    .replace(ANNOTATION, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function withoutNestedParentheses(text) {
  const versions = [text];
  for (const version of versions) {
    const flattened = version.replace(NESTED_PARENTHESES, '$1');
    if (flattened !== version) {
      versions.push(flattened);
    }
  }
  return versions.at(-1);
}

function isMethodDeclaration(declaration) {
  const head = declaration.slice(0, declaration.indexOf('('));
  return (
    declaration.includes('(') &&
    !head.includes('=') &&
    !/\b(?:class|interface|record|enum)\b/.test(head)
  );
}

function lineText(code, offset) {
  const start = code.lastIndexOf('\n', offset) + 1;
  const end = code.indexOf('\n', offset);
  return code.slice(start, end === -1 ? undefined : end).trim();
}

function lineOf(source, offset) {
  return source.slice(0, offset).split('\n').length;
}
