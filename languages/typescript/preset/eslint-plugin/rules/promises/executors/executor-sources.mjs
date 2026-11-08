import { resolveConstant, stringValue } from '../../analysis/constant-resolution.mjs';
import { memberName } from '../../analysis/test-code-analysis.mjs';

const LISTENERS = new Set([
  'on',
  'once',
  'addListener',
  'addEventListener',
  'prependListener',
  'prependOnceListener',
]);
const TIMERS = new Set([
  'setTimeout',
  'setInterval',
  'setImmediate',
  'queueMicrotask',
  'nextTick',
  'requestAnimationFrame',
  'requestIdleCallback',
  'IntersectionObserver',
  'MutationObserver',
  'ResizeObserver',
  'PerformanceObserver',
  'debounce',
  'throttle',
]);
const IN_PLACE = new Set([
  'forEach',
  'map',
  'filter',
  'reduce',
  'reduceRight',
  'some',
  'every',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'flatMap',
  'sort',
  'toSorted',
  'from',
  'replace',
  'replaceAll',
  'push',
  'unshift',
  'add',
  'set',
  'splice',
]);
const SAFE_EVENTS = new Set([
  'abort',
  'exit',
  'beforeExit',
  'DOMContentLoaded',
  'readystatechange',
  'visibilitychange',
]);
const PAGE_GLOBALS = new Set(['window', 'document', 'globalThis', 'self']);
const CALLS = new Set(['CallExpression', 'NewExpression']);
const MAX_TEXT = 40;

export function isListenerCall(node) {
  return (
    node?.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    LISTENERS.has(memberName(node.callee))
  );
}

export function isFunctionExpression(node) {
  return node?.type === 'ArrowFunctionExpression' || node?.type === 'FunctionExpression';
}

function isPromiseConstruction(node) {
  return (
    node?.type === 'NewExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'Promise' &&
    isFunctionExpression(node.arguments[0])
  );
}

export function nodesInside(context, root, { nested = false } = {}) {
  const keys = context.sourceCode.visitorKeys;
  const nodes = [];
  const pending = [root];
  for (const node of pending) {
    nodes.push(node);
    if (!nested && node !== root && isPromiseConstruction(node)) {
      continue;
    }
    for (const key of keys[node.type] ?? []) {
      const value = node[key];
      const children = Array.isArray(value) ? value : [value];
      pending.push(...children.filter((child) => typeof child?.type === 'string'));
    }
  }
  return nodes;
}

export function shortText(context, node) {
  const text = context.sourceCode.getText(node);
  if (text.length <= MAX_TEXT && !text.includes('\n')) {
    return text;
  }
  return memberName(node) ?? 'a call';
}

function calleeName(callee) {
  return callee.type === 'Identifier' ? callee.name : memberName(callee);
}

function isSafeEvent(event, receiver) {
  const global = receiver.type === 'Identifier' ? receiver.name : undefined;
  return (
    event !== undefined &&
    (SAFE_EVENTS.has(event) ||
      (event.startsWith('SIG') && global === 'process') ||
      (event === 'load' && PAGE_GLOBALS.has(global)))
  );
}

function mentionsSettler(context, node, settlers) {
  return nodesInside(context, node).some(
    (inner) => inner.type === 'Identifier' && settlers.has(inner.name),
  );
}

function isSettler(node, settlers) {
  return node?.type === 'Identifier' && settlers.has(node.name);
}

function settlingArgument(context, argument, settlers) {
  if (isSettler(argument, settlers)) {
    return true;
  }
  if (isFunctionExpression(argument)) {
    return mentionsSettler(context, argument.body, settlers);
  }
  return CALLS.has(argument.type) && argument.arguments.some((inner) => isSettler(inner, settlers));
}

function listenerSource(context, call, settlers) {
  const event = stringValue(resolveConstant(context, call.arguments[0]));
  if (
    isSafeEvent(event, call.callee.object) ||
    !call.arguments.slice(1).some((argument) => settlingArgument(context, argument, settlers))
  ) {
    return undefined;
  }
  const receiver = context.sourceCode.getText(call.callee.object);
  const name = event === undefined ? '...' : `'${event}'`;
  const shown = `${shortText(context, call.callee.object)}.${memberName(call.callee)}(${name})`;
  return { kind: 'listener', call, event, receiver, text: `\`${shown}\`` };
}

function pipeSource(context, call, settlers) {
  return call.arguments.some((argument) => mentionsSettler(context, argument, settlers))
    ? {
        kind: 'pipe',
        call,
        receiver: context.sourceCode.getText(call.callee.object),
        text: `\`${shortText(context, call.callee.object)}.pipe(...)\``,
      }
    : undefined;
}

function sourceOf(context, call, settlers) {
  const name = calleeName(call.callee);
  if (call.callee.type === 'MemberExpression' && LISTENERS.has(name)) {
    return listenerSource(context, call, settlers);
  }
  if (call.callee.type === 'MemberExpression' && name === 'pipe') {
    return pipeSource(context, call, settlers);
  }
  if (
    isPromiseConstruction(call) ||
    TIMERS.has(name) ||
    IN_PLACE.has(name) ||
    settlers.has(name) ||
    !call.arguments.some((argument) => settlingArgument(context, argument, settlers))
  ) {
    return undefined;
  }
  return {
    kind: 'callback',
    call,
    text: `the callback passed to \`${shortText(context, call.callee)}\``,
  };
}

function executorSources(context, executor, settlers) {
  return nodesInside(context, executor.body)
    .filter((node) => CALLS.has(node.type))
    .map((call) => sourceOf(context, call, settlers))
    .filter((source) => source !== undefined);
}

function parameterVariable(context, executor, parameter) {
  if (parameter?.type !== 'Identifier') {
    return undefined;
  }
  return context.sourceCode
    .getDeclaredVariables(executor)
    .find((variable) => variable.name === parameter.name);
}

export function promiseExecutor(context, construction) {
  if (!isPromiseConstruction(construction)) {
    return undefined;
  }
  const executor = construction.arguments[0];
  const resolve = parameterVariable(context, executor, executor.params[0]);
  if (resolve === undefined) {
    return undefined;
  }
  const reject = parameterVariable(context, executor, executor.params[1]);
  const settlers = [resolve, reject].filter((variable) => variable !== undefined);
  const sources = executorSources(context, executor, new Set(settlers.map(({ name }) => name)));
  return sources.length === 0
    ? undefined
    : { executor, resolve, rejects: (reject?.references.length ?? 0) > 0, settlers, sources };
}
