import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { exceptionEntryText, exceptionSentence } from '../../../../shared/exceptions/sentence.mjs';
import { hash, nextOccurrence } from '../../../../shared/rules/finding-helpers.mjs';

export const INLINE_SUPPRESSION_RULE = 'InlineSuppression';
const INLINE_SUPPRESSIBLE_RULES = ['PMD.SpringDataNativeQuery'];

const LITERALS_AND_COMMENTS =
  /"""(?:[^\\]|\\[\s\S])*?"""|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\/\/[^\n]*|\/\*[\s\S]*?\*\//g;
const SUPPRESS_WARNINGS = /@\s*(?:java\s*\.\s*lang\s*\.\s*)?SuppressWarnings\s*\(/g;
const JAVA_LANG_SUPPRESS_WARNINGS = /@\s*java\s*\.\s*lang\s*\.\s*SuppressWarnings\s*\(/g;
const BARE_SUPPRESS_WARNINGS = /@\s*SuppressWarnings\b/g;
const QUALIFIED_ANNOTATION = String.raw`@\s*(?:\w+\s*\.\s*)*`;
const SPOTBUGS_PACKAGE = String.raw`edu\s*\.\s*umd\s*\.\s*cs\s*\.\s*findbugs\s*\.\s*annotations\s*\.\s*`;
const SUPPRESS_FB_WARNINGS = new RegExp(
  [
    String.raw`${QUALIFIED_ANNOTATION}\w*SuppressFBWarnings\b`,
    String.raw`${QUALIFIED_ANNOTATION}\w+SuppressWarnings\b`,
    String.raw`@\s*${SPOTBUGS_PACKAGE}SuppressWarnings\b`,
  ].join('|'),
  'g',
);
const SPOTBUGS_SUPPRESS_WARNINGS_IMPORT =
  /\bimport\s+edu\s*\.\s*umd\s*\.\s*cs\s*\.\s*findbugs\s*\.\s*annotations\s*\.\s*(?:SuppressWarnings|\*)\s*;/;
const STRING_LITERAL = /"((?:[^"\\]|\\.)*)"/g;
const JUSTIFICATION = /\bjustification\s*=\s*"(?:[^"\\]|\\.)*"/g;
const UNICODE_ESCAPE = /\\u+([0-9a-fA-F]{4})/g;
const NESTED_PARENTHESES = /(\([^()]*)\([^()]*\)/g;
const ANNOTATION = /@[\w.]+(?:\s*\([^()]*\))?/g;
const LITERAL_ARGUMENTS = /^\s*(?:value\s*=)?[\s{},"]*$/;
const PMD_WARNING_NAMES = new Set(['all', 'unused', 'serial', 'fallthrough']);
const MESSAGE =
  'Do not silence PMD inline: fix the finding. PMD also honors "all", "unused", "serial" and "fallthrough". The one accepted marker is @SuppressWarnings("PMD.SpringDataNativeQuery") on a repository method that needs native SQL.';
const SPOTBUGS_MESSAGE = 'Do not silence SpotBugs inline: fix the bug.';
const ROUTED_RULES = { pmd: 'pmd/<PMD rule>', spotbugs: 'spotbugs/<bug pattern>' };

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
  const spotbugsOwnsSuppressWarnings = SPOTBUGS_SUPPRESS_WARNINGS_IMPORT.test(views.code);
  const suppressions = [
    ...pmdSuppressions(
      views,
      spotbugsOwnsSuppressWarnings ? JAVA_LANG_SUPPRESS_WARNINGS : SUPPRESS_WARNINGS,
    ),
    ...spotbugsSuppressions(views, spotbugsOwnsSuppressWarnings),
  ].sort((left, right) => left.offset - right.offset);
  return suppressions.map(({ tool, offset, found }) => {
    const key = `${found}\0${declarationAfter(views.code, offset)}\0${lineText(views.code, offset)}`;
    const occurrence = nextOccurrence(occurrences, `${tool}\0${key}`);
    return {
      tool,
      rule: INLINE_SUPPRESSION_RULE,
      path: filePath,
      identity: `${INLINE_SUPPRESSION_RULE}:${hash(key)}${occurrence === 1 ? '' : `#${String(occurrence)}`}`,
      message: `${tool === 'pmd' ? MESSAGE : SPOTBUGS_MESSAGE} Found: ${found}. ${exceptionSentence(exceptionEntryText({ rule: ROUTED_RULES[tool], path: filePath }))}`,
      classification: 'enforceable',
      location: { line: lineOf(views.code, offset) },
    };
  });
}

function pmdSuppressions(views, annotations) {
  return annotationSuppressions(views, annotations).map((suppression) => ({
    tool: 'pmd',
    ...suppression,
  }));
}

function spotbugsSuppressions({ code, withoutComments }, includeSuppressWarnings) {
  const annotations = includeSuppressWarnings
    ? new RegExp(`${SUPPRESS_FB_WARNINGS.source}|${BARE_SUPPRESS_WARNINGS.source}`, 'g')
    : SUPPRESS_FB_WARNINGS;
  return [...code.matchAll(annotations)].map((match) => ({
    tool: 'spotbugs',
    offset: match.index,
    found: spotbugsFound(withoutComments.slice(match.index, annotationEnd(code, match))),
  }));
}

function annotationEnd(code, match) {
  const afterName = match.index + match[0].replace(/\($/, '').length;
  const rest = code.slice(afterName);
  return /^\s*\(/.test(rest) ? code.indexOf(')', afterName) + 1 : afterName;
}

function spotbugsFound(annotation) {
  const values = [...annotation.replace(JUSTIFICATION, '').matchAll(STRING_LITERAL)].map(
    ([, value]) => `"${value}"`,
  );
  return values.length === 0 ? 'a suppression of every bug pattern' : values.join(', ');
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

function annotationSuppressions({ code, withoutComments }, annotations) {
  return [...code.matchAll(annotations)].flatMap((match) => {
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
