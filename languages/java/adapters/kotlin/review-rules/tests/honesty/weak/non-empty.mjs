import { trimmedEnd } from '../../discovery/text-scan.mjs';
import {
  argumentCalls,
  ASSERT_ROOT,
  dotReceiver,
  isLast,
  isSizeExpression,
  receiverStart,
  reportOffset,
  resultUnused,
  squeezed,
} from './call-scan.mjs';

const NOT_EMPTY_CALL = /^(?:.+\.isNot(?:Empty|Blank)\(\)|!.+\.is(?:Empty|Blank)\(\))$/u;
const EMPTY_CALL = /^.+\.is(?:Empty|Blank)\(\)$/u;
const COMPARISON = /^(.+?)(>=|>|!=)(\d+)L?$/u;
const REVERSED = /^(\d+)L?(<=|<|!=)(.+)$/u;
const ZERO = /^0L?$/u;
const KOTEST_NOT_EMPTY = new Set(['shouldNotBeEmpty', 'shouldNotBeBlank']);
const SIZE_ASSERT_ROOT = /^(?:\w+\.)*assertThat\w*\s*\((.+)\)$/u;
const ASSERTJ_NOT_EMPTY = new Set(['isNotEmpty', 'isNotBlank']);
const ASSERTJ_ZERO_ARG = new Set(['isPositive', 'isNotZero']);
const SIZE_BOUNDS = { hasSizeGreaterThan: 0, hasSizeGreaterThanOrEqualTo: 1 };
const VALUE_BOUNDS = { isGreaterThan: 0, isGreaterThanOrEqualTo: 1 };
const KOTEST_INFIX =
  /(?<=[\w)\]"}!][ \t]+)(shouldNotBe|shouldBeGreaterThan|shouldBeGreaterThanOrEqual|shouldHaveAtLeastSize)[ \t]+(\w+(?:<[^<>]*>)?(?:\(\))?|"")/gu;
const EMPTY_VALUE = /^(?:empty\w*(?:<.*>)?\(\)|"")$/u;

function positiveBound(operator, number) {
  return (
    (['>', '!='].includes(operator) && Number(number) === 0) ||
    (operator === '>=' && Number(number) === 1)
  );
}

function sizeComparison(argument) {
  const text = squeezed(argument);
  const direct = COMPARISON.exec(text);
  if (direct !== null) {
    return isSizeExpression(direct[1]) && positiveBound(direct[2], direct[3]);
  }
  const reversed = REVERSED.exec(text);
  const flipped = { '<': '>', '<=': '>=', '!=': '!=' };
  return (
    reversed !== null &&
    isSizeExpression(reversed[3]) &&
    positiveBound(flipped[reversed[2]], reversed[1])
  );
}

function assertionCall(call) {
  const { name, args } = call;
  const sized = {
    assertTrue: () =>
      args.some((argument) => NOT_EMPTY_CALL.test(argument) || sizeComparison(argument)),
    assertFalse: () => args.some((argument) => EMPTY_CALL.test(argument)),
    assertNotEquals: () =>
      args.some((argument) => ZERO.test(squeezed(argument))) && args.some(isSizeExpression),
  };
  return sized[name]?.() === true;
}

function assertJ(scanned, call) {
  const receiver = dotReceiver(scanned, call.offset);
  if (receiver === undefined || !ASSERT_ROOT.test(receiver.text) || !isLast(scanned, call.close)) {
    return false;
  }
  const subject = SIZE_ASSERT_ROOT.exec(receiver.text)?.[1];
  const sizeSubject = subject !== undefined && isSizeExpression(subject);
  const bound = call.args.length === 1 ? Number(squeezed(call.args[0]).replace(/L$/u, '')) : NaN;
  const { name } = call;
  return (
    (ASSERTJ_NOT_EMPTY.has(name) && call.args.length === 0) ||
    (name in SIZE_BOUNDS && bound === SIZE_BOUNDS[name]) ||
    (sizeSubject && ASSERTJ_ZERO_ARG.has(name)) ||
    (sizeSubject && name in VALUE_BOUNDS && bound === VALUE_BOUNDS[name])
  );
}

function kotestCall(scanned, call) {
  const receiver = dotReceiver(scanned, call.offset);
  if (receiver === undefined) {
    return false;
  }
  const listed =
    (KOTEST_NOT_EMPTY.has(call.name) && call.args.length === 0) ||
    (call.name === 'shouldHaveAtLeastSize' && call.args.map(squeezed)[0] === '1');
  return listed && resultUnused(scanned, receiver.start, call.close);
}

function kotestInfix(scanned, { verb, value, start }) {
  const left = receiverStart(scanned, start);
  const operand = scanned.code.slice(left, trimmedEnd(scanned, start)).trim();
  const bounded =
    (verb === 'shouldBeGreaterThan' && value === '0') ||
    (verb === 'shouldBeGreaterThanOrEqual' && value === '1') ||
    (verb === 'shouldHaveAtLeastSize' && value === '1') ||
    (verb === 'shouldNotBe' && value === '0' && isSizeExpression(operand));
  const sizeSubject = verb.startsWith('shouldBeGreater') ? isSizeExpression(operand) : true;
  const emptied = verb === 'shouldNotBe' && EMPTY_VALUE.test(value);
  return operand !== '' && sizeSubject && (bounded || emptied)
    ? { offset: left, form: verb }
    : undefined;
}

function infixMatches(scanned, body) {
  return [...scanned.code.slice(body.start, body.end).matchAll(KOTEST_INFIX)].flatMap((match) => {
    const entry = kotestInfix(scanned, {
      verb: match[1],
      value: match[2],
      start: body.start + match.index,
    });
    return entry === undefined ? [] : [entry];
  });
}

export function nonEmptyChecks(scanned, body) {
  const calls = argumentCalls(scanned, body).flatMap((call) => {
    const form =
      (assertionCall(call) && call.name) ||
      (assertJ(scanned, call) && call.name) ||
      (kotestCall(scanned, call) && call.name);
    return form ? [{ offset: reportOffset(scanned, call.offset), form }] : [];
  });
  return [...calls, ...infixMatches(scanned, body)];
}
