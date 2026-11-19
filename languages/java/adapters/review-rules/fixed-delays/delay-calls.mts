import { splitTopLevel } from '../max-value-sums/source-file.mts';
import { evaluate } from './delay-constants.mts';
import type { Constants } from './delay-constants.mts';
import type { SourceFile, Span } from '../max-value-sums/sum-types.mts';

const UNIT_MILLIS = new Map([
  ['NANOSECONDS', 0.000_001],
  ['MICROSECONDS', 0.001],
  ['MILLISECONDS', 1],
  ['SECONDS', 1000],
  ['MINUTES', 60_000],
  ['HOURS', 3_600_000],
  ['DAYS', 86_400_000],
]);
const SCHEDULERS = new Set([
  'schedule',
  'scheduleAtFixedRate',
  'scheduleWithFixedDelay',
  'scheduleAtFixedDelay',
]);

export type DelayCall = {
  readonly index: number;
  readonly timer: string;
  readonly name: string;
  readonly millis: number;
};

type Timer = { readonly name: string; readonly open: number; readonly unit: number; readonly from: number };

const WINDOW = 7;
const SLEEP = /^Thread \. sleep \(/u;
const TIME_UNIT_SLEEP = /^TimeUnit \. (\w+) \. sleep \(/u;
const DELAY = /^delay \(/u;
const SCHEDULE = /^(\w+) \(/u;

function openOf(index: number, matched: string): number {
  return index + matched.split(' ').length - 1;
}

function timerAt(source: SourceFile, index: number): Timer | undefined {
  const head = source.tokens
    .slice(index, index + WINDOW)
    .map(({ text }) => text)
    .join(' ');
  const before = source.tokens[index - 1]?.text ?? '';
  const sleep = SLEEP.exec(head)?.[0];
  if (sleep !== undefined) {
    return { name: 'Thread.sleep', open: openOf(index, sleep), unit: 1, from: 0 };
  }
  const [timeUnit, unitName = ''] = TIME_UNIT_SLEEP.exec(head) ?? [];
  const unit = UNIT_MILLIS.get(unitName);
  if (timeUnit !== undefined && unit !== undefined) {
    return {
      name: `TimeUnit.${unitName}.sleep`,
      open: openOf(index, timeUnit),
      unit,
      from: 0,
    };
  }
  const delay = DELAY.exec(head)?.[0];
  if (source.kotlin && delay !== undefined && before !== '.' && before !== 'fun') {
    return { name: 'delay', open: openOf(index, delay), unit: 1, from: 0 };
  }
  const [scheduled, scheduler = ''] = SCHEDULE.exec(head) ?? [];
  if (scheduled !== undefined && SCHEDULERS.has(scheduler) && before !== 'fun') {
    return { name: scheduler, open: openOf(index, scheduled), unit: 1, from: 1 };
  }
  return undefined;
}

function scheduleUnit(source: SourceFile, span: Span): number {
  const named = source.tokens
    .slice(span.from, span.to)
    .map(({ text }) => UNIT_MILLIS.get(text))
    .find((millis) => millis !== undefined);
  return named ?? 1;
}

function firstConstant(source: SourceFile, constants: Constants, span: Span): string | undefined {
  const token = source.tokens
    .slice(span.from, span.to)
    .find(({ kind, text }) => kind === 'identifier' && constants.has(text));
  return token?.text;
}

function delayOf(
  source: SourceFile,
  constants: Constants,
  { timer, span }: { timer: Timer; span: Span },
): DelayCall | undefined {
  const name = firstConstant(source, constants, span);
  const value = name === undefined ? undefined : evaluate(source, constants, span);
  const unit = timer.name.startsWith('schedule')
    ? scheduleUnit(source, { from: timer.open, to: source.partner[timer.open] ?? 0 })
    : timer.unit;
  return name === undefined || value === undefined
    ? undefined
    : { index: timer.open, timer: timer.name, name, millis: value * unit };
}

export function delayCalls(source: SourceFile, constants: Constants): DelayCall[] {
  return [...source.tokens.keys()].flatMap((index) => {
    const timer = timerAt(source, index);
    const close = timer === undefined ? -1 : (source.partner[timer.open] ?? -1);
    if (timer === undefined || close < 0) {
      return [];
    }
    const spans = splitTopLevel(source, { from: timer.open + 1, to: close });
    const found = spans
      .slice(timer.from, timer.from === 0 ? 1 : undefined)
      .map((span) => delayOf(source, constants, { timer, span }))
      .find((delay) => delay !== undefined);
    return found === undefined ? [] : [found];
  });
}
