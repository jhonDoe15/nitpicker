import { readFileSync } from 'node:fs';
import path from 'node:path';
import { exceptionRoute as untypedExceptionRoute } from '../../../../shared/exceptions/rule-names.mjs';
import { appendSentence as untypedAppendSentence } from '../../../../shared/messages/exception-sentence.mjs';
import { ERROR_PRONE_MESSAGE, errorProneEscapes } from './errorprone/errorprone-escapes.mts';
import { hash, nextOccurrence, projectFilesUnder } from '../typed/finding-views.mts';
import type {
  InlineFinding,
  SourceViews,
  Suppression,
  WarningValue,
} from './suppression-types.mts';

const exceptionRoute: (entry: {
  rule: string;
  path: string;
  function: undefined;
  name: undefined;
  key: undefined;
}) => string | undefined = untypedExceptionRoute;
const appendSentence: (message: string, sentence: string | undefined) => string =
  untypedAppendSentence;

export const INLINE_SUPPRESSION_RULE = 'InlineSuppression';
export const INLINE_SUPPRESSIBLE_RULES = ['PMD.SpringDataNativeQuery'];

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
const LITERAL_ARGUMENTS = /^(?:\s*value\s*=)?[\s{},"]*$/;
const PMD_WARNING_NAMES = new Set(['all', 'unused', 'serial', 'fallthrough']);
const MESSAGE =
  'Do not silence PMD inline: fix the finding. PMD also honors "all", "unused", "serial" and "fallthrough". The one accepted marker is @SuppressWarnings("PMD.SpringDataNativeQuery") on a repository method that needs native SQL.';
const SPOTBUGS_MESSAGE = 'Do not silence SpotBugs inline: fix the bug.';
export const INLINE_SUPPRESSION_MESSAGES: Readonly<Record<string, string>> = {
  pmd: MESSAGE,
  spotbugs: SPOTBUGS_MESSAGE,
  errorprone: ERROR_PRONE_MESSAGE,
};

export function readInlineSuppressionFindings(
  projectRoot: string,
  sourceRoots: readonly string[],
): InlineFinding[] {
  return sourceRoots.flatMap((sourceRoot) =>
    javaFiles(path.join(projectRoot, sourceRoot)).flatMap((file) =>
      fileFindings(
        readFileSync(file, 'utf8'),
        path.relative(projectRoot, file).split(path.sep).join('/'),
      ),
    ),
  );
}

function javaFiles(directory: string): string[] {
  return projectFilesUnder(directory)
    .filter((file) => file.endsWith('.java'))
    .sort();
}

export function fileFindings(source: string, filePath: string): InlineFinding[] {
  const views = sourceViews(
    source.replace(UNICODE_ESCAPE, (_: string, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    ),
  );
  const occurrences = new Map<string, number>();
  const spotbugsOwnsSuppressWarnings = SPOTBUGS_SUPPRESS_WARNINGS_IMPORT.test(views.code);
  const javaLangAnnotations = spotbugsOwnsSuppressWarnings
    ? JAVA_LANG_SUPPRESS_WARNINGS
    : SUPPRESS_WARNINGS;
  const suppressions = [
    ...pmdSuppressions(views, javaLangAnnotations),
    ...errorProneEscapes({
      views,
      warningValues: suppressWarningsValues(views, javaLangAnnotations),
      pmdNames: PMD_WARNING_NAMES,
    }),
    ...spotbugsSuppressions(views, spotbugsOwnsSuppressWarnings),
  ].sort((left, right) => left.offset - right.offset);
  return suppressions.map(({ tool, offset, found }) => {
    const route = exceptionRoute({
      rule: `${tool}/${INLINE_SUPPRESSION_RULE}`,
      path: filePath,
      function: undefined,
      name: undefined,
      key: undefined,
    });
    const key = `${found}\0${declarationAfter(views.code, offset)}\0${lineText(views.code, offset)}`;
    const occurrence = nextOccurrence(occurrences, `${tool}\0${key}`);
    return {
      tool,
      rule: INLINE_SUPPRESSION_RULE,
      path: filePath,
      identity: `${INLINE_SUPPRESSION_RULE}:${hash(key)}${occurrence === 1 ? '' : `#${String(occurrence)}`}`,
      message: appendSentence(`${INLINE_SUPPRESSION_MESSAGES[tool] ?? ''} Found: ${found}.`, route),
      classification: 'enforceable',
      location: { line: lineOf(views.code, offset) },
    };
  });
}

function pmdSuppressions(views: SourceViews, annotations: RegExp): Suppression[] {
  return annotationSuppressions(views, annotations).map((suppression) => ({
    tool: 'pmd',
    ...suppression,
  }));
}

function spotbugsSuppressions(
  { code, withoutComments }: SourceViews,
  includeSuppressWarnings: boolean,
): Suppression[] {
  const annotations = includeSuppressWarnings
    ? new RegExp(`${SUPPRESS_FB_WARNINGS.source}|${BARE_SUPPRESS_WARNINGS.source}`, 'g')
    : SUPPRESS_FB_WARNINGS;
  return [...code.matchAll(annotations)].map((match) => ({
    tool: 'spotbugs',
    offset: match.index,
    found: spotbugsFound(withoutComments.slice(match.index, annotationEnd(code, match))),
  }));
}

function annotationEnd(code: string, match: RegExpExecArray): number {
  const afterName = match.index + match[0].replace(/\($/, '').length;
  const rest = code.slice(afterName);
  return /^\s*\(/.test(rest) ? code.indexOf(')', afterName) + 1 : afterName;
}

function spotbugsFound(annotation: string): string {
  const values = [...annotation.replace(JUSTIFICATION, '').matchAll(STRING_LITERAL)].map(
    ([, value]) => `"${value ?? ''}"`,
  );
  return values.length === 0 ? 'a suppression of every bug pattern' : values.join(', ');
}

function sourceViews(source: string): SourceViews {
  const code = source.replace(LITERALS_AND_COMMENTS, (token) =>
    isComment(token)
      ? blank(token)
      : `${token[0] ?? ''}${blank(token.slice(1, -1))}${token.at(-1) ?? ''}`,
  );
  const withoutComments = source.replace(LITERALS_AND_COMMENTS, (token) =>
    isComment(token) ? blank(token) : token,
  );
  return { code, withoutComments };
}

function isComment(token: string): boolean {
  return token.startsWith('/');
}

function blank(text: string): string {
  return text.replace(/[^\n]/g, ' ');
}

function suppressWarningsValues(
  { code, withoutComments }: SourceViews,
  annotations: RegExp,
): WarningValue[] {
  return [...code.matchAll(annotations)].map((match) => {
    const start = match.index + match[0].length;
    const end = code.indexOf(')', start);
    return {
      offset: match.index,
      end,
      literal: LITERAL_ARGUMENTS.test(code.slice(start, end)),
      values: [...withoutComments.slice(start, end).matchAll(STRING_LITERAL)].map(
        ([, value]) => value ?? '',
      ),
    };
  });
}

function annotationSuppressions(
  views: SourceViews,
  annotations: RegExp,
): Omit<Suppression, 'tool'>[] {
  const { code } = views;
  return suppressWarningsValues(views, annotations).flatMap(({ offset, end, literal, values }) => {
    if (!literal) {
      return [{ offset, found: 'a constant expression' }];
    }
    const silencesPmd = values.filter(
      (value) => PMD_WARNING_NAMES.has(value) || /^PMD(?:\.|$)/.test(value),
    );
    return silencesPmd.length === 0 || isAcceptedMarker(silencesPmd, code, end + 1)
      ? []
      : [{ offset, found: silencesPmd.map((value) => `"${value}"`).join(', ') }];
  });
}

function isAcceptedMarker(silencesPmd: readonly string[], code: string, offset: number): boolean {
  return (
    silencesPmd.every((value) => INLINE_SUPPRESSIBLE_RULES.includes(value)) &&
    isMethodDeclaration(declarationAfter(code, offset))
  );
}

function declarationAfter(code: string, offset: number): string {
  const rest = code.slice(offset);
  const end = rest.search(/[{;]/);
  return withoutNestedParentheses(end === -1 ? rest : rest.slice(0, end))
    .replace(ANNOTATION, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function withoutNestedParentheses(text: string): string {
  const nesting = text.split('(').length;
  return Array.from({ length: nesting }).reduce<string>(
    (current) => current.replace(NESTED_PARENTHESES, '$1'),
    text,
  );
}

function isMethodDeclaration(declaration: string): boolean {
  const head = declaration.slice(0, declaration.indexOf('('));
  return (
    declaration.includes('(') &&
    !head.includes('=') &&
    !/\b(?:class|interface|record|enum)\b/.test(head)
  );
}

function lineText(code: string, offset: number): string {
  const start = code.lastIndexOf('\n', offset) + 1;
  const end = code.indexOf('\n', offset);
  return code.slice(start, end === -1 ? undefined : end).trim();
}

export function lineOf(source: string, offset: number): number {
  return source.slice(0, offset).split('\n').length;
}
