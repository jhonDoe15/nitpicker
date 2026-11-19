import type { Span, TestScanned } from '../../typed/discovery-types.mts';
import type { ArgCall, Form } from '../../typed/rule-types.mts';

type LaterCall = ArgCall & { later: Span };
import { trimmedEnd } from '../../discovery/text-scan.mts';
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
} from './call-scan.mts';

const NOT_NULL = /^(?:(.+?)!=null|null!=(.+))$/u;
const IS_NULL = /^(?:(.+?)==null|null==(.+))$/u;
const STRING_START = /^"/u;
const QUALIFIER = /^(?:\w+\s*\.\s*)*\w+$/u;
const KOTEST_NULL = /(?<=[\w)\]"}!][ \t]+)shouldNotBe[ \t]+null\b/gu;

function operand(argument: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(squeezed(argument));
  return match?.[1] ?? match?.[2];
}

function checked(args: string[], pattern: RegExp): string | undefined {
  return args.map((argument) => operand(argument, pattern)).find((found) => found !== undefined);
}

function assertedValue(call: LaterCall): string | undefined {
  const [first = '', second = ''] = call.args;
  return call.args.length === 2 && STRING_START.test(first) && !STRING_START.test(second)
    ? second
    : first;
}

function guardsLater(scanned: TestScanned, later: Span, expression: string | undefined): boolean {
  return expression !== undefined && usedAgain(scanned, later, expression);
}

function qualifiedStart(scanned: TestScanned, offset: number): number {
  const receiver = dotReceiver(scanned, offset);
  return receiver !== undefined && QUALIFIER.test(receiver.text) ? receiver.start : offset;
}

function assertNotNull(scanned: TestScanned, call: LaterCall): boolean {
  return (
    call.name === 'assertNotNull' &&
    call.args.length > 0 &&
    resultUnused(scanned, qualifiedStart(scanned, call.offset), call.close) &&
    !guardsLater(scanned, call.later, assertedValue(call))
  );
}

function nullComparison(scanned: TestScanned, call: LaterCall): boolean {
  const patterns: Record<string, RegExp | undefined> = {
    assertTrue: NOT_NULL,
    assertFalse: IS_NULL,
  };
  const pattern = patterns[call.name];
  const expression = pattern === undefined ? undefined : checked(call.args, pattern);
  return expression !== undefined && !guardsLater(scanned, call.later, expression);
}

function shouldNotBeNull(scanned: TestScanned, call: LaterCall): boolean {
  const receiver = call.name === 'shouldNotBeNull' ? dotReceiver(scanned, call.offset) : undefined;
  return (
    receiver !== undefined &&
    resultUnused(scanned, receiver.start, call.close) &&
    !guardsLater(scanned, call.later, receiver.text)
  );
}

function assertJNotNull(scanned: TestScanned, call: LaterCall): boolean {
  const receiver = call.name === 'isNotNull' ? dotReceiver(scanned, call.offset) : undefined;
  return receiver !== undefined && ASSERT_ROOT.test(receiver.text) && isLast(scanned, call.close);
}

function infixNotNull(
  scanned: TestScanned,
  { start, end, later }: { start: number; end: number; later: Span },
): boolean {
  const left = receiverStart(scanned, start);
  const expression = scanned.code.slice(left, trimmedEnd(scanned, start)).trim();
  return (
    expression !== '' &&
    resultUnused(scanned, left, end - 1) &&
    !guardsLater(scanned, later, expression)
  );
}

function infixMatches(scanned: TestScanned, body: Span): Form[] {
  return [...scanned.code.slice(body.start, body.end).matchAll(KOTEST_NULL)]
    .map((match) => {
      const end = body.start + match.index + match[0].length;
      return { start: body.start + match.index, end, later: { start: end, end: body.end } };
    })
    .filter((range) => infixNotNull(scanned, range))
    .map(({ start }) => ({ offset: receiverStart(scanned, start), form: 'shouldNotBe-null' }));
}

function presenceForm(scanned: TestScanned, call: LaterCall): string | undefined {
  if (assertNotNull(scanned, call)) {
    return 'assertNotNull';
  }
  if (nullComparison(scanned, call)) {
    return `${call.name}-null`;
  }
  if (shouldNotBeNull(scanned, call)) {
    return 'shouldNotBeNull';
  }
  return assertJNotNull(scanned, call) ? 'isNotNull' : undefined;
}

export function presenceChecks(scanned: TestScanned, body: Span): Form[] {
  const calls = argumentCalls(scanned, body).flatMap((found) => {
    const call = { ...found, later: { start: found.close, end: body.end } };
    const form = presenceForm(scanned, call);
    return form === undefined ? [] : [{ offset: reportOffset(scanned, call.offset), form }];
  });
  return [...calls, ...infixMatches(scanned, body)];
}
