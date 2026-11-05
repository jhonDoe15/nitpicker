import {
  constantNumber,
  isFunctionNode,
  resolveConstant,
  resolveFunction,
} from '../analysis/constant-resolution.mjs';
import { variableNamed } from '../analysis/ancestry.mjs';
import { propertyKeyName } from '../analysis/test-code-analysis.mjs';
import { optionsMayChange } from './process-options-mutations.mjs';

const TYPE_WRAPPERS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression']);
const UNKNOWN_VALUE = Symbol('unknown option value');

function resolved(context, node) {
  const pending = [resolveConstant(context, node)];
  for (const current of pending) {
    if (TYPE_WRAPPERS.has(current?.type)) {
      pending.push(resolveConstant(context, current.expression));
    }
  }
  return pending.at(-1);
}

function isUndefined(context, node) {
  return (
    node?.type === 'Identifier' &&
    node.name === 'undefined' &&
    (variableNamed(context.sourceCode, node)?.defs.length ?? 0) === 0
  );
}

function propertyValue(property, previous, key) {
  const name = propertyKeyName(property);
  if (name === key) {
    return property.value;
  }
  return property.computed && name === undefined ? UNKNOWN_VALUE : previous;
}

function expandOptions(context, entry, call) {
  const expression = entry.node?.type === 'SpreadElement' ? entry.node.argument : entry.node;
  const value = resolved(context, expression);
  if (optionsMayChange(context, expression, call)) {
    return { unknown: true };
  }
  if (value?.type === 'ObjectExpression' && !entry.ancestors.includes(value)) {
    return {
      properties: value.properties.map((property) => ({
        node: property,
        ancestors: [...entry.ancestors, value],
      })),
    };
  }
  return {
    unknown:
      value !== undefined &&
      !isUndefined(context, value) &&
      !(value.type === 'Literal' && value.value === null),
  };
}

function optionReader(context, call, node) {
  return (key) => {
    const pending = [{ node, ancestors: [] }];
    let value;
    for (const [index, entry] of pending.entries()) {
      if (entry.node?.type === 'Property') {
        value = propertyValue(entry.node, value, key);
        continue;
      }
      const expanded = expandOptions(context, entry, call);
      if (expanded.unknown) {
        value = UNKNOWN_VALUE;
      }
      pending.splice(index + 1, 0, ...(expanded.properties ?? []));
    }
    return value;
  };
}

function isNothing(context, node) {
  return isUndefined(context, node) || (node?.type === 'Literal' && node.value === null);
}

function optionsCandidate(context, call, commandOnly) {
  const [, second, third] = call.arguments;
  if (commandOnly || third !== undefined) {
    return commandOnly ? second : third;
  }
  return isArgumentList(context, second) ? undefined : second;
}

export function optionsArgument(context, call, commandOnly) {
  const options = optionsCandidate(context, call, commandOnly);
  const isCallback =
    isFunctionNode(resolved(context, options)) || resolveFunction(context, options) !== undefined;
  return isCallback ? undefined : options;
}

function isArgumentList(context, node) {
  const value = resolved(context, node);
  return value?.type === 'ArrayExpression' || isNothing(context, value);
}

function timeoutMissing(context, timeout) {
  if (timeout === undefined) {
    return true;
  }
  const value = resolved(context, timeout);
  if (isUndefined(context, value)) {
    return true;
  }
  const number = constantNumber(context, value);
  return number !== undefined && (!Number.isFinite(number) || number <= 0);
}

function signalMissing(context, signal) {
  return (
    signal === undefined ||
    (signal !== UNKNOWN_VALUE && isNothing(context, resolved(context, signal)))
  );
}

export function lacksDeadline(context, call, { options, signalKeys = [] }) {
  if (call.arguments.some((argument) => argument.type === 'SpreadElement')) {
    return false;
  }
  const optionValue = optionReader(context, call, options);
  const timeout = optionValue('timeout');
  if (timeout === UNKNOWN_VALUE || !timeoutMissing(context, timeout)) {
    return false;
  }
  return signalKeys.every((key) => signalMissing(context, optionValue(key)));
}

export function lacksProcessTimeout(context, call, name) {
  return lacksDeadline(context, call, {
    options: optionsArgument(context, call, name === 'execSync'),
  });
}
