import { capture } from '../../../common/matches.mts';
import type {
  JvmLanguage,
  MaskedViews,
  ParsedTest,
  TestFamily,
  TypeScope,
} from '../../../common/types.mts';
import { maskSource } from '../../masking/mask.mts';
import { uniqueKeys } from '../../occurrences.mts';
import { closingBracket, lineOfIndex, nextCode } from '../../text.mts';
import { measureBody } from '../assertions.mts';
import { kotestTests } from './kotest.mts';
import { sourceRows } from './rows.mts';

const TEST_ANNOTATION =
  /@(?:[\w.]+\.)?(?:Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate|Property|CartesianTest)\b/gu;
const DISABLED = /@(?:[\w.]+\.)?(?:Disabled\w*|Ignored?|Enabled(?:On\w+|If\w*|For\w+))\b/u;
const TYPE_DECLARATION = /\b(?:class|object|interface)\s+(\w+)/gu;
const ANNOTATION_NAME = /^@[\w.:]+/u;
const METHOD_NAME: Readonly<Record<JvmLanguage, RegExp>> = {
  java: /^[^()]*?(\w+)\s*\(/u,
  kotlin: /\bfun\s+(?:<[^>]*>\s*)?(`[^`]+`|\w+)\s*\(/u,
};

type Method = { name: string; start: number; headerEnd: number; bodyEnd: number };

function annotationNameEnd(masked: string, at: number): number {
  if (masked[at + 1] === '[') {
    const close = closingBracket(masked, at + 1);
    return close === -1 ? masked.length : close + 1;
  }
  const length = ANNOTATION_NAME.exec(masked.slice(at))?.[0].length ?? 1;
  return at + length;
}

function skipAnnotations(masked: string, from: number): number {
  let index = nextCode(masked, from);
  while (masked[index] === '@') {
    index = annotationNameEnd(masked, index);
    const open = nextCode(masked, index);
    const close = masked[open] === '(' ? closingBracket(masked, open) : open - 1;
    if (close === -1) return masked.length;
    index = nextCode(masked, close + 1);
  }
  return index;
}

function boundaryBefore(masked: string, index: number): number {
  return (
    Math.max(
      masked.lastIndexOf(';', index),
      masked.lastIndexOf('{', index),
      masked.lastIndexOf('}', index),
    ) + 1
  );
}

function typeScopes(masked: string): TypeScope[] {
  return [...masked.matchAll(TYPE_DECLARATION)].flatMap((match) => {
    const open = masked.indexOf('{', match.index);
    const close = open === -1 ? -1 : closingBracket(masked, open);
    const header = masked.slice(boundaryBefore(masked, match.index), open);
    return close === -1 ? [] : [{ name: capture(match, 1), open, close, header }];
  });
}

function expressionEnd(masked: string, from: number): number {
  let depth = 0;
  for (let index = from; index < masked.length; index += 1) {
    depth +=
      Number('([{'.includes(masked.charAt(index))) - Number(')]}'.includes(masked.charAt(index)));
    const continued = /^\s*[.?&|+-]/u.test(masked.slice(index + 1, index + 40));
    if (depth <= 0 && masked[index] === '\n' && !continued) return index;
  }
  return masked.length;
}

function methodAt({
  masked,
  from,
  language,
}: {
  masked: string;
  from: number;
  language: JvmLanguage;
}): Method | undefined {
  const start = skipAnnotations(masked, from);
  const brace = masked.indexOf('{', start);
  const named = METHOD_NAME[language].exec(
    masked.slice(start, brace === -1 ? undefined : brace + 1),
  );
  if (named === null) return undefined;
  const close = closingBracket(masked, start + named.index + named[0].length - 1);
  const headerEnd = close + 1 + masked.slice(close + 1).search(/[{=;]/u);
  const bodyEnd =
    masked[headerEnd] === '{'
      ? closingBracket(masked, headerEnd) + 1
      : expressionEnd(masked, headerEnd);
  return { name: capture(named, 1).replaceAll('`', ''), start, headerEnd, bodyEnd };
}

function shapeOf(kept: string): string {
  return kept
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join('\n');
}

function familyOf(masked: string): TestFamily {
  if (/^\s*import\s+org\.junit\.jupiter\b/mu.test(masked)) return 'jupiter';
  return /^\s*import\s+(?:static\s+)?org\.junit\.(?!jupiter|platform)/mu.test(masked)
    ? 'junit4'
    : 'other';
}

function buildTest({
  language,
  views,
  match,
  scopes,
}: {
  language: JvmLanguage;
  views: MaskedViews;
  match: RegExpExecArray;
  scopes: readonly TypeScope[];
}): ParsedTest | undefined {
  const method = methodAt({ masked: views.masked, from: match.index, language });
  if (method === undefined) return undefined;
  const enclosing = scopes.filter((scope) => scope.open < match.index && scope.close > match.index);
  const own = views.masked.slice(boundaryBefore(views.masked, match.index), method.headerEnd);
  const { headerEnd, bodyEnd } = method;
  function bodyOf(text: string): string {
    return text.slice(headerEnd, bodyEnd);
  }
  const measured = measureBody(language, {
    masked: bodyOf(views.masked),
    kept: bodyOf(views.kept),
  });
  const disabled = DISABLED.test(own) || enclosing.some((scope) => DISABLED.test(scope.header));
  const expectsThrow = /@(?:[\w.]+\.)?Test\s*\([^)]*\bexpected\b/u.test(own);
  return {
    key: [...enclosing.map((scope) => scope.name), method.name].join('.'),
    line: lineOfIndex(views.masked, match.index),
    shape: shapeOf(bodyOf(views.kept)),
    source: views.kept.slice(method.start, method.bodyEnd),
    ...measured,
    assertions: measured.assertions + Number(expectsThrow),
    skipped: measured.skipped || disabled,
    rows: sourceRows(own),
    collected:
      !/\bprivate\b/u.test(own) && !enclosing.some((scope) => /\babstract\b/u.test(scope.header)),
    family: familyOf(views.masked),
  };
}

export function parseJvmTests(language: JvmLanguage, text: string): ParsedTest[] {
  const views = {
    masked: maskSource(language, text).masked,
    kept: maskSource(language, text, { keepStrings: true }).masked,
  };
  const scopes = typeScopes(views.masked);
  const annotated = [...views.masked.matchAll(TEST_ANNOTATION)]
    .map((match) => buildTest({ language, views, match, scopes }))
    .filter((test) => test !== undefined);
  const specs = language === 'kotlin' ? kotestTests({ views, scopes }) : [];
  return uniqueKeys([...annotated, ...specs]);
}
