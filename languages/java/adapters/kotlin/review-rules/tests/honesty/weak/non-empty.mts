import type { Span, TestScanned } from '../../typed/discovery-types.mts';
import type { ArgCall, Form } from '../../typed/rule-types.mts';
import { groupOf } from '../../typed/indexing.mts';
import { trimmedEnd } from '../../discovery/text-scan.mts';
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
} from './call-scan.mts';

const NOT_EMPTY_CALL = /^(?:.+\.isNot(?:Empty|Blank)\(\)|!.+\.is(?:Empty|Blank)\(\))$/u;
const EMPTY_CALL = /^.+\.is(?:Empty|Blank)\(\)$/u;
const COMPARISON = /^(.+?)(>=|>|!=)(\d+)L?$/u;
const REVERSED = /^(\d+)L?(<=|<|!=)(.+)$/u;
const ZERO = /^0L?$/u;
const KOTEST_NOT_EMPTY = new Set(['shouldNotBeEmpty', 'shouldNotBeBlank']);
const SIZE_ASSERT_ROOT = /^(?:\w+\.)*assertThat\w*\s*\((.+)\)$/u;
const ASSERTJ_NOT_EMPTY = new Set(['isNotEmpty', 'isNotBlank']);
const ASSERTJ_ZERO_ARG = new Set(['isPositive', 'isNotZero']);
const SIZE_BOUNDS: Record<string, number> = {
  hasSizeGreaterThan: 0,
  hasSizeGreaterThanOrEqualTo: 1,
};
const VALUE_BOUNDS: Record<string, number> = { isGreaterThan: 0, isGreaterThanOrEqualTo: 1 };
const KOTEST_INFIX =
  /(?<=[\w)\]"}!][ \t]+)(shouldNotBe|shouldBeGreaterThan|shouldBeGreaterThanOrEqual|shouldHaveAtLeastSize)[ \t]+(\w+(?:<[^<>]*>)?(?:\(\))?|"")/gu;
const EMPTY_VALUE = /^(?:empty\w*(?:<.*>)?\(\)|"")$/u;

function positiveBound(operator: string, number: string): boolean {
  return (
    (['>', '!='].includes(operator) && Number(number) === 0) ||
    (operator === '>=' && Number(number) === 1)
  );
}

function sizeComparison(argument: string): boolean {
  const text = squeezed(argument);
  const direct = COMPARISON.exec(text);
  if (direct !== null) {
    const [, subject = '', operator = '', bound = ''] = direct;
    return isSizeExpression(subject) && positiveBound(operator, bound);
  }
  const reversed = REVERSED.exec(text);
  const flipped: Record<string, string> = { '<': '>', '<=': '>=', '!=': '!=' };
  if (reversed === null) {
    return false;
  }
  const [, bound = '', operator = '', subject = ''] = reversed;
  return isSizeExpression(subject) && positiveBound(flipped[operator] ?? '', bound);
}

function assertionCall(call: ArgCall): boolean {
  const { name, args } = call;
  const sized: Record<string, (() => boolean) | undefined> = {
    assertTrue: () =>
      args.some((argument) => NOT_EMPTY_CALL.test(argument) || sizeComparison(argument)),
    assertFalse: () => args.some((argument) => EMPTY_CALL.test(argument)),
    assertNotEquals: () =>
      args.some((argument) => ZERO.test(squeezed(argument))) && args.some(isSizeExpression),
  };
  return sized[name]?.() === true;
}

function assertJ(scanned: TestScanned, call: ArgCall): boolean {
  const receiver = dotReceiver(scanned, call.offset);
  if (receiver === undefined || !ASSERT_ROOT.test(receiver.text) || !isLast(scanned, call.close)) {
    return false;
  }
  const subject = SIZE_ASSERT_ROOT.exec(receiver.text)?.[1];
  const sizeSubject = subject !== undefined && isSizeExpression(subject);
  const bound =
    call.args.length === 1 ? Number(squeezed(call.args[0] ?? '').replace(/L$/u, '')) : NaN;
  const { name } = call;
  return (
    (ASSERTJ_NOT_EMPTY.has(name) && call.args.length === 0) ||
    (name in SIZE_BOUNDS && bound === SIZE_BOUNDS[name]) ||
    (sizeSubject && ASSERTJ_ZERO_ARG.has(name)) ||
    (sizeSubject && name in VALUE_BOUNDS && bound === VALUE_BOUNDS[name])
  );
}

function kotestCall(scanned: TestScanned, call: ArgCall): boolean {
  const receiver = dotReceiver(scanned, call.offset);
  if (receiver === undefined) {
    return false;
  }
  const listed =
    (KOTEST_NOT_EMPTY.has(call.name) && call.args.length === 0) ||
    (call.name === 'shouldHaveAtLeastSize' && call.args.map(squeezed)[0] === '1');
  return listed && resultUnused(scanned, receiver.start, call.close);
}

function kotestInfix(
  scanned: TestScanned,
  { verb, value, start }: { verb: string; value: string; start: number },
): Form | undefined {
  const left = receiverStart(scanned, start);
  const operand = scanned.code.slice(left, trimmedEnd(scanned, start)).trim();
  const bounded =
    (verb === 'shouldBeGreaterThan' && value === '0') ||
    (verb === 'shouldBeGreaterThanOrEqual' && value === '1') ||
    (verb === 'shouldHaveAtLeastSize' && value === '1') ||
    (verb === 'shouldNotBe' && value === '0' && isSizeExpression(operand));
  const sizeSubject = !verb.startsWith('shouldBeGreater') || isSizeExpression(operand);
  const emptied = verb === 'shouldNotBe' && EMPTY_VALUE.test(value);
  return operand !== '' && sizeSubject && (bounded || emptied)
    ? { offset: left, form: verb }
    : undefined;
}

function infixMatches(scanned: TestScanned, body: Span): Form[] {
  return [...scanned.code.slice(body.start, body.end).matchAll(KOTEST_INFIX)].flatMap((match) => {
    const entry = kotestInfix(scanned, {
      verb: groupOf(match, 1),
      value: groupOf(match, 2),
      start: body.start + match.index,
    });
    return entry === undefined ? [] : [entry];
  });
}

export function nonEmptyChecks(scanned: TestScanned, body: Span): Form[] {
  const calls = argumentCalls(scanned, body).flatMap((call) => {
    const matched = assertionCall(call) || assertJ(scanned, call) || kotestCall(scanned, call);
    return matched ? [{ offset: reportOffset(scanned, call.offset), form: call.name }] : [];
  });
  return [...calls, ...infixMatches(scanned, body)];
}
