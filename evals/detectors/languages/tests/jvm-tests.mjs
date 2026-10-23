import { maskSource } from '../masking/mask.mjs';
import { closingBracket } from '../occurrences.mjs';
import { measureBody } from './patterns.mjs';

const TEST_ANNOTATION =
  /@(?:[\w.]+\.)?(?:Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate|Property|CartesianTest)\b/gu;
const DISABLED = /@(?:[\w.]+\.)?(?:Disabled\w*|Ignored?)\b/u;
const TYPE_DECLARATION = /\b(?:class|object|interface)\s+(\w+)/gu;
const METHOD_NAME = {
  java: /^[^()]*?(\w+)\s*\(/u,
  kotlin: /\bfun\s+(?:<[^>]*>\s*)?(`[^`]+`|\w+)\s*\(/u,
};

const nextCode = (masked, from) => from + masked.slice(from).search(/\S|$/u);

// The index of the first thing after the annotations that start at `from`.
function skipAnnotations(masked, from) {
  let index = nextCode(masked, from);
  while (masked[index] === '@') {
    index += /^@[\w.:]+/u.exec(masked.slice(index))[0].length;
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
  const named = METHOD_NAME[language === 'kotlin' ? 'kotlin' : 'java'].exec(
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

function buildTest({ language, views, match, scopes }) {
  const method = methodAt({ masked: views.masked, from: match.index, language });
  if (method === undefined) return undefined;
  const enclosing = scopes.filter((scope) => scope.open < match.index && scope.close > match.index);
  const own = views.masked.slice(boundaryBefore(views.masked, match.index), method.headerEnd);
  const body = {
    masked: views.masked.slice(method.start, method.bodyEnd),
    kept: views.kept.slice(method.start, method.bodyEnd),
  };
  const measured = measureBody(language, body);
  const disabled = DISABLED.test(own) || enclosing.some((scope) => DISABLED.test(scope.header));
  return {
    key: [...enclosing.map((scope) => scope.name), method.name].join('.'),
    line: views.masked.slice(0, match.index).split('\n').length,
    shape: views.kept
      .slice(method.headerEnd, method.bodyEnd)
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .join('\n'),
    source: body.kept,
    ...measured,
    skipped: measured.skipped || disabled,
  };
}

/**
 * The tests of a JUnit or Kotlin test file: every method annotated `@Test`, `@ParameterizedTest`,
 * `@RepeatedTest`, `@TestFactory`, `@TestTemplate`, `@Property` or `@CartesianTest`, keyed by its
 * enclosing classes and name (`CartTest.Totals.sumsLines`). Each is `{ key, line, shape, source,
 * assertions, tautologies, weak, skipped }`. A method is skipped by `@Disabled`, `@Ignore` or a
 * false assumption, or when a class around it is.
 */
export function parseJvmTests(language, text) {
  const views = {
    masked: maskSource(language, text).masked,
    kept: maskSource(language, text, { keepStrings: true }).masked,
  };
  const scopes = typeScopes(views.masked);
  const seen = new Map();
  return [...views.masked.matchAll(TEST_ANNOTATION)]
    .map((match) => buildTest({ language, views, match, scopes }))
    .filter((test) => test !== undefined)
    .map((test) => {
      const count = seen.get(test.key) ?? 0;
      seen.set(test.key, count + 1);
      return count === 0 ? test : { ...test, key: `${test.key}#${String(count + 1)}` };
    });
}
