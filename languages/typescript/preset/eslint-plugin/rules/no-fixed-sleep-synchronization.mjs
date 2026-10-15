import { readLayout } from '../../head-policy.mjs';
import { sleepAdvice } from './test-runner/runner-advice.mjs';
import { importedCalleeName, moduleBindings } from './test-code-analysis.mjs';

const { isTestFixture } = readLayout();
const TIMER_PROMISE_MODULES = new Set(['timers/promises', 'node:timers/promises']);

function isSetTimeout(callee) {
  if (callee.type === 'Identifier') return callee.name === 'setTimeout';
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    ['globalThis', 'window', 'global'].includes(callee.object.name) &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'setTimeout'
  );
}

function isSchedulerWait(callee, timerPromises) {
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'wait' &&
    importedCalleeName(callee.object, timerPromises) === 'scheduler'
  );
}

function onlyCalls(callback, resolveName) {
  if (!['ArrowFunctionExpression', 'FunctionExpression'].includes(callback?.type)) return false;
  const body =
    callback.body.type === 'BlockStatement' && callback.body.body.length === 1
      ? callback.body.body[0].expression
      : callback.body;
  return (
    body?.type === 'CallExpression' &&
    body.callee.type === 'Identifier' &&
    body.callee.name === resolveName
  );
}

function resolvesLater(argument, resolveName) {
  return (
    (argument?.type === 'Identifier' && argument.name === resolveName) ||
    onlyCalls(argument, resolveName)
  );
}

function callsResolveTimeout(node, resolveName) {
  if (!node || typeof node !== 'object') return false;
  if (
    node.type === 'CallExpression' &&
    isSetTimeout(node.callee) &&
    resolvesLater(node.arguments[0], resolveName)
  )
    return true;
  return Object.entries(node).some(
    ([key, value]) =>
      key !== 'parent' &&
      (Array.isArray(value)
        ? value.some((child) => callsResolveTimeout(child, resolveName))
        : value !== null && typeof value === 'object' && callsResolveTimeout(value, resolveName)),
  );
}

export const rule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      fixedSleep: 'Fixed sleeps are non-deterministic; {{advice}}.',
    },
  },
  create(context) {
    if (isTestFixture(context.filename)) return {};
    let timerPromises = { named: new Map(), namespaces: new Set() };
    return {
      Program(node) {
        timerPromises = moduleBindings(node, TIMER_PROMISE_MODULES);
      },
      AwaitExpression(node) {
        const argument = node.argument;
        if (
          argument.type === 'CallExpression' &&
          argument.callee.type === 'Identifier' &&
          ['sleep', 'delay', 'wait'].includes(argument.callee.name)
        ) {
          context.report({ node, messageId: 'fixedSleep', data: { advice: sleepAdvice(context) } });
          return;
        }
        if (
          argument.type === 'CallExpression' &&
          importedCalleeName(argument.callee, timerPromises) === 'setTimeout'
        ) {
          context.report({ node, messageId: 'fixedSleep', data: { advice: sleepAdvice(context) } });
          return;
        }
        if (argument.type === 'CallExpression' && isSchedulerWait(argument.callee, timerPromises)) {
          context.report({ node, messageId: 'fixedSleep', data: { advice: sleepAdvice(context) } });
          return;
        }
        if (
          argument.type === 'NewExpression' &&
          argument.callee.type === 'Identifier' &&
          argument.callee.name === 'Promise'
        ) {
          const executor = argument.arguments[0];
          if (
            ['ArrowFunctionExpression', 'FunctionExpression'].includes(executor?.type) &&
            executor.params[0]?.type === 'Identifier' &&
            callsResolveTimeout(executor.body, executor.params[0].name)
          )
            context.report({
              node,
              messageId: 'fixedSleep',
              data: { advice: sleepAdvice(context) },
            });
        }
      },
    };
  },
};
