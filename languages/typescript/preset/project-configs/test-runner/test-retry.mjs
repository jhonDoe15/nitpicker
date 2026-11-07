import { isCount } from '../../../../../shared/config.mjs';

const MAX_RETRY_COUNT = 10;
const MAX_RETRY_DELAY_MS = 10_000;
const RETRY_KEYS = new Set(['count', 'delay', 'condition']);
const COUNT_FORM = `a whole number from 0 to ${String(MAX_RETRY_COUNT)}`;
const OBJECT_FORM =
  `{ count, delay, condition } with a count from 0 to ${String(MAX_RETRY_COUNT)}, ` +
  `a delay from 0 to ${String(MAX_RETRY_DELAY_MS)} ms and a condition that is a RegExp without flags`;

function isCountUpTo(value, maximum) {
  return isCount(value) && value <= maximum;
}

function isCondition(value) {
  return value === undefined || (typeof value.source === 'string' && value.flags === '');
}

function isObjectRetry(retry) {
  return (
    typeof retry === 'object' &&
    retry !== null &&
    Object.keys(retry).every((key) => RETRY_KEYS.has(key)) &&
    (retry.count === undefined || isCountUpTo(retry.count, MAX_RETRY_COUNT)) &&
    (retry.delay === undefined || isCountUpTo(retry.delay, MAX_RETRY_DELAY_MS)) &&
    isCondition(retry.condition)
  );
}

function isRetry(retry, takesObject) {
  return isCountUpTo(retry, MAX_RETRY_COUNT) || (takesObject && isObjectRetry(retry));
}

function shown(retry) {
  return retry === null || Number.isNaN(retry) ? 'not a number' : JSON.stringify(retry);
}

export function checkedRetry(retry, setting, takesObject) {
  if (retry !== undefined && !isRetry(retry, takesObject)) {
    throw new Error(
      `${setting} is ${shown(retry)}: it must be ${COUNT_FORM}${takesObject ? ` or ${OBJECT_FORM}` : ''}`,
    );
  }
  return retry === undefined ? {} : { retry };
}

export function retryValues(retry) {
  const {
    count = 0,
    delay = 0,
    condition,
  } = typeof retry === 'object' && retry !== null ? retry : { count: retry };
  return {
    retry: count,
    'retry.delay': delay,
    ...(condition === undefined ? {} : { 'retry.condition': `/${condition.source}/` }),
  };
}

export function vitestRetryArguments(retry) {
  if (typeof retry !== 'object') {
    return retry === undefined ? [] : [`--retry=${String(retry)}`];
  }
  return [
    ...(retry.count === undefined ? [] : [`--retry.count=${String(retry.count)}`]),
    ...(retry.delay === undefined ? [] : [`--retry.delay=${String(retry.delay)}`]),
    ...(retry.condition === undefined ? [] : [`--retry.condition=${retry.condition.source}`]),
  ];
}
