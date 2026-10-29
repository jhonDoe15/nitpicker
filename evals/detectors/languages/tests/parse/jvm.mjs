import { maskSource } from '../../masking/mask.mjs';
import { uniqueKeys } from '../../occurrences.mjs';
import { closingBracket, lineOfIndex, nextCode } from '../../text.mjs';
import { measureBody } from '../assertions.mjs';
import { kotestTests } from './kotest.mjs';
import { sourceRows } from './rows.mjs';

const TEST_ANNOTATION =
  /@(?:[\w.]+\.)?(?:Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate|Property|CartesianTest)\b/gu;
const DISABLED = /@(?:[\w.]+\.)?(?:Disabled\w*|Ignored?|Enabled(?:On\w+|If\w*|For\w+))\b/u;
const TYPE_DECLARATION = /\b(?:class|object|interface)\s+(\w+)/gu;
const ANNOTATION_NAME = /^@[\w.:]+/u;
const METHOD_NAME = {
  java: /^[^()]*?(\w+)\s*\(/u,
  kotlin: /\bfun\s+(?:<[^>]*>\s*)?(`[^`]+`|\w+)\s*\(/u,
};

// The index after an annotation's name: past `Name`, or past a bracketed list `@[A B]`.
function annotationNameEnd(masked, at) {
  if (masked[at + 1] === '[') {
    const close = closingBracket(masked, at + 1);
    return close === -1 ? masked.length : close + 1;
  }
  const length = ANNOTATION_NAME.exec(masked.slice(at))?.[0].length ?? 1;
  return at + length;
}

// The index of the first thing after the annotations that start at `from`.
function skipAnnotations(masked, from) {
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

const boundaryBefore = (masked, index) =>
  Math.max(
    masked.lastIndexOf(';', index),
    masked.lastIndexOf('{', index),
    masked.lastIndexOf('}', index),
  ) + 1;

// Each class, object and interface with the range of its body and the text that declares it.
function typeScopes(masked) {
  return [...masked.matchAll(TYPE_DECLARATION)].flatMap((match) => {
    const open = masked.indexOf('{', match.index);
    const close = open === -1 ? -1 : closingBracket(masked, open);
    const header = masked.slice(boundaryBefore(masked, match.index), open);
    return close === -1 ? [] : [{ name: match[1], open, close, header }];
  });
}

// The end of a Kotlin expression body (`fun f() = ...`): the first line break outside brackets.
function expressionEnd(masked, from) {
  let depth = 0;
  for (let index = from; index < masked.length; index += 1) {
    depth += Number('([{'.includes(masked[index])) - Number(')]}'.includes(masked[index]));
    const continued = /^\s*[.?&|+-]/u.test(masked.slice(index + 1, index + 40));
    if (depth <= 0 && masked[index] === '\n' && !continued) return index;
  }
  return masked.length;
}

// The method declared from `from` on (after its annotations): its name and where it ends.
function methodAt({ masked, from, language }) {
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
  return { name: named[1].replaceAll('`', ''), start, headerEnd, bodyEnd };
}

const shapeOf = (kept) =>
  kept
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join('\n');

const familyOf = (masked) => {
  if (/^\s*import\s+org\.junit\.jupiter\b/mu.test(masked)) return 'jupiter';
  return /^\s*import\s+(?:static\s+)?org\.junit\.(?!jupiter|platform)/mu.test(masked)
    ? 'junit4'
    : 'other';
};

function buildTest({ language, views, match, scopes }) {
  const method = methodAt({ masked: views.masked, from: match.index, language });
  if (method === undefined) return undefined;
  const enclosing = scopes.filter((scope) => scope.open < match.index && scope.close > match.index);
  const own = views.masked.slice(boundaryBefore(views.masked, match.index), method.headerEnd);
  const bodyOf = (text) => text.slice(method.headerEnd, method.bodyEnd);
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

/**
 * The tests of a JUnit or Kotlin test file: every method annotated `@Test`, `@ParameterizedTest`,
 * `@RepeatedTest`, `@TestFactory`, `@TestTemplate`, `@Property` or `@CartesianTest`, and in Kotlin
 * the tests of a Kotest spec (see `kotestTests`), keyed by its enclosing classes and name
 * (`CartTest.Totals.sumsLines`). Each is `{ key, line, shape, source, assertions, tautologies, weak,
 * skipped, rows, collected, family }`. A method is skipped by `@Disabled`, `@Ignore`, an `@Enabled*`
 * condition or a false assumption, or when a class around it is. `collected` is false for a private
 * method or one in an abstract class, which no runner calls; `family` is the JUnit generation the
 * file imports (`jupiter`, `junit4` or `other`); `rows` the cases its argument sources give.
 */
export function parseJvmTests(language, text) {
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
