import { fieldOf, messageOf, objectOf, textOf } from '../../../../../shared/values/readers.mts';
import { isCount } from '../../project-tools/typed/shared-views.mts';

const DELAY = 'delay';
const CONDITION = 'condition';
const SOURCE = 'source';
const MAX_RETRY_COUNT = 10;
const MAX_RETRY_DELAY_MS = 10_000;
const RETRY_KEYS = new Set(['count', DELAY, CONDITION]);
const COUNT_FORM = `a whole number from 0 to ${String(MAX_RETRY_COUNT)}`;
const OBJECT_FORM =
  `{ count, delay, condition } with a count from 0 to ${String(MAX_RETRY_COUNT)}, ` +
  `a delay from 0 to ${String(MAX_RETRY_DELAY_MS)} ms and a condition that is a RegExp without flags`;

function isCountUpTo(value: unknown, maximum: number): boolean {
  return typeof value === 'number' && isCount(value) && value <= maximum;
}

function isCondition(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof fieldOf(value, 'source') === 'string' && fieldOf(value, 'flags') === '')
  );
}

function isObjectRetry(retry: unknown): boolean {
  const count = fieldOf(retry, 'count');
  const delay = fieldOf(retry, 'delay');
  return (
    typeof retry === 'object' &&
    retry !== null &&
    Object.keys(retry).every((key) => RETRY_KEYS.has(key)) &&
    (count === undefined || isCountUpTo(count, MAX_RETRY_COUNT)) &&
    (delay === undefined || isCountUpTo(delay, MAX_RETRY_DELAY_MS)) &&
    isCondition(fieldOf(retry, 'condition'))
  );
}

type RetryForm = 'count' | 'count-or-object';

function isRetry(retry: unknown, accepts: RetryForm): boolean {
  return (
    isCountUpTo(retry, MAX_RETRY_COUNT) || (accepts === 'count-or-object' && isObjectRetry(retry))
  );
}

function shown(retry: unknown): string {
  return retry === null || Number.isNaN(retry) ? 'not a number' : JSON.stringify(retry);
}

export function checkedRetry(
  retry: unknown,
  setting: string,
  accepts: RetryForm,
): { retry?: unknown } {
  if (retry !== undefined && !isRetry(retry, accepts)) {
    throw new Error(
      `${setting} is ${shown(retry)}: it must be ${COUNT_FORM}${accepts === 'count-or-object' ? ` or ${OBJECT_FORM}` : ''}`,
    );
  }
  return retry === undefined ? {} : { retry };
}

export function retryValues(retry: unknown): Record<string, unknown> {
  const object = objectOf(retry);
  const given = object === undefined ? retry : fieldOf(object, 'count');
  const count = given === undefined ? 0 : given;
  const givenDelay = fieldOf(object, DELAY);
  const delay = givenDelay === undefined ? 0 : givenDelay;
  const condition = fieldOf(object, CONDITION);
  return {
    retry: count,
    'retry.delay': delay,
    ...(condition === undefined
      ? {}
      : { 'retry.condition': `/${textOf(fieldOf(condition, SOURCE))}/` }),
  };
}

export function vitestRetryArguments(retry: unknown): string[] {
  if (typeof retry !== 'object') {
    return retry === undefined ? [] : [`--retry=${messageOf(retry)}`];
  }
  const count = fieldOf(retry, 'count');
  const delay = fieldOf(retry, DELAY);
  const condition = fieldOf(retry, CONDITION);
  return [
    ...(count === undefined ? [] : [`--retry.count=${messageOf(count)}`]),
    ...(delay === undefined ? [] : [`--retry.delay=${messageOf(delay)}`]),
    ...(condition === undefined ? [] : [`--retry.condition=${textOf(fieldOf(condition, SOURCE))}`]),
  ];
}
