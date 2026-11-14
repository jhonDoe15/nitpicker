import { appendingArgument } from '../support/calls.mjs';
import { addingProperty, isPlainObject, keyName } from '../support/objects.mjs';

function addedToOptions(sourceCode, options, timeout) {
  const hasTimeout = options.properties?.some((entry) => keyName(entry) === 'timeout');
  return isPlainObject(options) && !hasTimeout
    ? addingProperty(sourceCode, options, `timeout: ${timeout}`)
    : undefined;
}

function missingOptions(sourceCode, call, { method, timeout }) {
  const options = `{ timeout: ${timeout} }`;
  const count = call.arguments.length;
  if (method === 'execSync') {
    return count === 1 ? appendingArgument(sourceCode, call, options) : undefined;
  }
  const [, second] = call.arguments;
  if (count === 1) {
    return appendingArgument(sourceCode, call, `[], ${options}`);
  }
  return count === 2 && second.type === 'ArrayExpression'
    ? appendingArgument(sourceCode, call, options)
    : undefined;
}

export function processTimeoutFix(sourceCode, call, { method, timeout, optionsNode }) {
  if (call.arguments.length === 0 || call.arguments.some(({ type }) => type === 'SpreadElement')) {
    return undefined;
  }
  return optionsNode === undefined
    ? missingOptions(sourceCode, call, { method, timeout })
    : addedToOptions(sourceCode, optionsNode, timeout);
}
