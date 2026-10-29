import { splitArguments } from '../../../scan/kotlin-source.mjs';
import { classesOf } from '../discovery/declarations.mjs';
import { functionOwners, functionsOf } from '../discovery/functions.mjs';
import { testBodies } from '../discovery/test-units.mjs';
import { HOLDER, isFractional, NUMBER } from './fractional-literal.mjs';
import { truthHits } from './truth-assertions.mjs';

export const FLOAT_EQUALITY_RULE = 'FloatEqualityInTest';
const FLOAT_EQUALITY_MESSAGE =
  'Do not assert exact equality with a fractional floating-point literal: a computed 0.1 + 0.2 differs from 0.3 in the last bits, so the test fails on rounding noise or passes by luck. The same holds for assertTrue(x == 0.1) and for a != check. Give the comparison a tolerance: assertEquals(expected, actual, absoluteTolerance = 1e-9) in kotlin.test, the delta overload in JUnit, `actual shouldBe (expected plusOrMinus 1e-9)` in Kotest, or assertThat(actual).isCloseTo(expected, within(1e-9)) in AssertJ. An integral literal such as 1.0 is exact and allowed.';

const EQUALS_CALL = new RegExp(
  String.raw`(?<![\w.\x60])(?:${HOLDER})?(assertEquals|assertNotEquals)\s*(?:<[^<>()]*>\s*)?\(`,
  'gu',
);
const SHOULD_CALL = /(?<=\.)(shouldBe|shouldNotBe)\s*\(/gu;
const ASSERTJ_CALL = /(?<=\.)(isEqualTo|isNotEqualTo)\s*\(/gu;
const SHOULD_INFIX = new RegExp(
  String.raw`(?<=[\w)\]"}][ \t]+)(shouldBe|shouldNotBe)[ \t]+(\(?[-+]?${NUMBER}\)?)(?=[ \t]*(?:[\n\r)};,]|$))`,
  'gu',
);
const ASSERTJ_IMPORT = /\borg\.assertj\b/u;
const NAMED_ARGUMENT = /^(\w+)\s*=(?!=)([\s\S]*)$/u;
const TOLERANCE_NAMES = new Set(['absoluteTolerance', 'delta']);
const VALUE_NAMES = new Set(['expected', 'actual']);
const MESSAGE_START = /^["{]/u;
const VALUE_COUNT = 2;
const MESSAGE_FIRST_COUNT = 3;

function argumentsOf(scanned, open) {
  const { parts } = splitArguments(scanned.code, open);
  return parts.map(({ start, end }) => {
    const text = scanned.code.slice(start, end).trim();
    const named = NAMED_ARGUMENT.exec(text);
    return named === null ? { text } : { name: named[1], text: named[2].trim() };
  });
}

function isExactComparison(args) {
  if (args.some(({ name }) => TOLERANCE_NAMES.has(name))) {
    return false;
  }
  const positional = args.filter(({ name }) => name === undefined);
  const leading =
    positional.length >= MESSAGE_FIRST_COUNT && MESSAGE_START.test(positional[0].text) ? 1 : 0;
  const values = [
    ...positional.slice(leading, leading + VALUE_COUNT),
    ...args.filter(({ name }) => VALUE_NAMES.has(name)),
  ];
  const third = positional[leading + VALUE_COUNT];
  const hasDelta = third !== undefined && !MESSAGE_START.test(third.text);
  return !hasDelta && values.some(({ text }) => isFractional(text));
}

function callHits(scanned, pattern, isExact) {
  return [...scanned.code.matchAll(pattern)].flatMap((match) => {
    const open = match.index + match[0].length - 1;
    return isExact(argumentsOf(scanned, open))
      ? [{ name: match[1], offset: match.index + match[0].indexOf(match[1]) }]
      : [];
  });
}

function isSingleFraction(args) {
  return args.length === 1 && isFractional(args[0].text);
}

function infixHits(scanned) {
  return [...scanned.code.matchAll(SHOULD_INFIX)]
    .filter((match) => isFractional(match[2]))
    .map((match) => ({ name: match[1], offset: match.index }));
}

function hitsIn(scanned) {
  const assertj = ASSERTJ_IMPORT.test(scanned.code);
  return [
    ...callHits(scanned, EQUALS_CALL, isExactComparison),
    ...callHits(scanned, SHOULD_CALL, isSingleFraction),
    ...(assertj ? callHits(scanned, ASSERTJ_CALL, isSingleFraction) : []),
    ...infixHits(scanned),
    ...truthHits(scanned, assertj),
  ];
}

function contains(range, offset) {
  return range.start <= offset && offset < range.end;
}

function innermost(candidates, offset) {
  return candidates
    .filter(({ range }) => contains(range, offset))
    .toSorted((left, right) => right.range.start - left.range.start)[0];
}

function symbolFinder(scanned, suites) {
  const nodes = testBodies(scanned, suites).map((node) => ({
    range: node.body,
    symbol: node.symbol,
  }));
  const owners = functionOwners(scanned);
  const functions = functionsOf(scanned).map((fn) => ({
    range: fn.body,
    symbol: [owners.get(fn.offset)?.name, fn.name].filter(Boolean).join('.'),
  }));
  const classes = classesOf(scanned).map((klass) => ({
    range: { start: klass.offset, end: klass.end },
    symbol: klass.name,
  }));
  return (offset) =>
    (innermost(nodes, offset) ?? innermost(functions, offset) ?? innermost(classes, offset))
      ?.symbol ?? '';
}

export function floatEqualityReports(scanned, suites) {
  const symbolAt = symbolFinder(scanned, suites);
  return hitsIn(scanned).map(({ name, offset }) => {
    const symbol = symbolAt(offset);
    return {
      rule: FLOAT_EQUALITY_RULE,
      offset,
      symbol,
      key: `${symbol}:${name}`,
      message: FLOAT_EQUALITY_MESSAGE,
    };
  });
}
