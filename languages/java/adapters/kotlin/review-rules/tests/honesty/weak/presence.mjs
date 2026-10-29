import { trimmedEnd } from '../../discovery/text-scan.mjs';
import {
  argumentCalls,
  ASSERT_ROOT,
  dotReceiver,
  isLast,
  receiverStart,
  reportOffset,
  resultUnused,
  squeezed,
  usedAgain,
} from './call-scan.mjs';

const NOT_NULL = /^(?:(.+?)!=null|null!=(.+))$/u;
const IS_NULL = /^(?:(.+?)==null|null==(.+))$/u;
const STRING_START = /^"/u;
const QUALIFIER = /^(?:\w+\s*\.\s*)*\w+$/u;
const KOTEST_NULL = /(?<=[\w)\]"}!][ \t]+)shouldNotBe[ \t]+null\b/gu;

function operand(argument, pattern) {
  const match = pattern.exec(squeezed(argument));
  return match?.[1] ?? match?.[2];
}

function checked(args, pattern) {
  return args.map((argument) => operand(argument, pattern)).find((found) => found !== undefined);
}

function assertedValue(call) {
  const [first, second] = call.args;
  return call.args.length === 2 && STRING_START.test(first) && !STRING_START.test(second)
    ? second
    : first;
}

function guardsLater(scanned, later, expression) {
  return expression !== undefined && usedAgain(scanned, later, expression);
}

function qualifiedStart(scanned, offset) {
  const receiver = dotReceiver(scanned, offset);
  return receiver !== undefined && QUALIFIER.test(receiver.text) ? receiver.start : offset;
}

function assertNotNull(scanned, call) {
  return (
    call.name === 'assertNotNull' &&
    call.args.length > 0 &&
    resultUnused(scanned, qualifiedStart(scanned, call.offset), call.close) &&
    !guardsLater(scanned, call.later, assertedValue(call))
  );
}

function nullComparison(scanned, call) {
  const pattern = { assertTrue: NOT_NULL, assertFalse: IS_NULL }[call.name];
  const expression = pattern === undefined ? undefined : checked(call.args, pattern);
  return expression !== undefined && !guardsLater(scanned, call.later, expression);
}

function shouldNotBeNull(scanned, call) {
  const receiver = call.name === 'shouldNotBeNull' ? dotReceiver(scanned, call.offset) : undefined;
  return (
    receiver !== undefined &&
    resultUnused(scanned, receiver.start, call.close) &&
    !guardsLater(scanned, call.later, receiver.text)
  );
}

function assertJNotNull(scanned, call) {
  const receiver = call.name === 'isNotNull' ? dotReceiver(scanned, call.offset) : undefined;
  return receiver !== undefined && ASSERT_ROOT.test(receiver.text) && isLast(scanned, call.close);
}

function infixNotNull(scanned, { start, end, later }) {
  const left = receiverStart(scanned, start);
  const expression = scanned.code.slice(left, trimmedEnd(scanned, start)).trim();
  return (
    expression !== '' &&
    resultUnused(scanned, left, end - 1) &&
    !guardsLater(scanned, later, expression)
  );
}

function infixMatches(scanned, body) {
  return [...scanned.code.slice(body.start, body.end).matchAll(KOTEST_NULL)]
    .map((match) => {
      const end = body.start + match.index + match[0].length;
      return { start: body.start + match.index, end, later: { start: end, end: body.end } };
    })
    .filter((range) => infixNotNull(scanned, range))
    .map(({ start }) => ({ offset: receiverStart(scanned, start), form: 'shouldNotBe-null' }));
}

export function presenceChecks(scanned, body) {
  const calls = argumentCalls(scanned, body).flatMap((found) => {
    const call = { ...found, later: { start: found.close, end: body.end } };
    const form =
      (assertNotNull(scanned, call) && 'assertNotNull') ||
      (nullComparison(scanned, call) && `${call.name}-null`) ||
      (shouldNotBeNull(scanned, call) && 'shouldNotBeNull') ||
      (assertJNotNull(scanned, call) && 'isNotNull');
    return form ? [{ offset: reportOffset(scanned, call.offset), form }] : [];
  });
  return [...calls, ...infixMatches(scanned, body)];
}
