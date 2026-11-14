import { appendingArgument } from '../support/calls.mjs';
import { addingProperty, isPlainObject, keyName } from '../support/objects.mjs';

export const HTTP_TIMEOUT_MS = 10_000;

const DEADLINE_KEYS = new Set(['signal', 'timeout', 'dispatcher', 'agent']);

function withDeadline(sourceCode, call, { index, property }) {
  const options = call.arguments[index];
  if (options === undefined) {
    return call.arguments.length === index
      ? appendingArgument(sourceCode, call, `{ ${property} }`)
      : undefined;
  }
  const hasDeadline = options.properties?.some((entry) => DEADLINE_KEYS.has(keyName(entry)));
  return isPlainObject(options) && !hasDeadline
    ? addingProperty(sourceCode, options, property)
    : undefined;
}

export function httpTimeoutFix(sourceCode, call, { found, axiosPosition }) {
  if (call.arguments.some((argument) => argument.type === 'SpreadElement')) {
    return undefined;
  }
  if (found.client === 'fetch') {
    const property = `signal: AbortSignal.timeout(${HTTP_TIMEOUT_MS})`;
    return call.callee.type === 'Identifier' || call.callee.type === 'MemberExpression'
      ? withDeadline(sourceCode, call, { index: 1, property })
      : undefined;
  }
  const { callee } = call;
  const isMethodCall =
    found.client === 'axios' &&
    found.call.startsWith('axios.') &&
    found.call !== 'axios.create()' &&
    callee.type === 'MemberExpression' &&
    !callee.computed;
  const index = isMethodCall ? axiosPosition(callee.property.name) : undefined;
  return index === undefined
    ? undefined
    : withDeadline(sourceCode, call, { index, property: `timeout: ${HTTP_TIMEOUT_MS}` });
}
