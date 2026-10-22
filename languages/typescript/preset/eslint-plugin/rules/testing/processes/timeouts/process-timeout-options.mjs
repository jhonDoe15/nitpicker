import { constantNumber, resolveConstant } from '../../../analysis/constant-resolution.mjs';
import { variableNamed } from '../../../analysis/ancestry.mjs';
import { propertyKeyName } from '../../../analysis/test-code-analysis.mjs';
import { optionsMayChange } from './process-options-mutations.mjs';

const TYPE_WRAPPERS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression']);
const UNKNOWN_TIMEOUT = Symbol('unknown timeout');

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

function propertyTimeout(property, previous) {
  const key = propertyKeyName(property);
  if (key === 'timeout') {
    return property.value;
  }
  return property.computed && key === undefined ? UNKNOWN_TIMEOUT : previous;
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

function timeoutValue(context, node, call) {
  const pending = [{ node, ancestors: [] }];
  let timeout;
  for (const [index, entry] of pending.entries()) {
    if (entry.node?.type === 'Property') {
      timeout = propertyTimeout(entry.node, timeout);
      continue;
    }
    const expanded = expandOptions(context, entry, call);
    if (expanded.unknown) {
      timeout = UNKNOWN_TIMEOUT;
    }
    pending.splice(index + 1, 0, ...(expanded.properties ?? []));
  }
  return timeout;
}

function optionsOf(context, call, name) {
  if (name === 'execSync') {
    return call.arguments[1];
  }
  if (call.arguments[2] !== undefined) {
    return call.arguments[2];
  }
  const second = resolved(context, call.arguments[1]);
  return second?.type === 'ArrayExpression' || isUndefined(context, second)
    ? undefined
    : call.arguments[1];
}

export function lacksProcessTimeout(context, call, name) {
  if (call.arguments.some((argument) => argument.type === 'SpreadElement')) {
    return false;
  }
  const timeout = timeoutValue(context, optionsOf(context, call, name), call);
  if (timeout === UNKNOWN_TIMEOUT) {
    return false;
  }
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
