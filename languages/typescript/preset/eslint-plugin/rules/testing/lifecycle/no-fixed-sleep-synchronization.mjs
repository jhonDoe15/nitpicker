import { depthFirst, objectChildren } from '../../../../../../../shared/traversal.mjs';
import { readLayout } from '../../../../head-policy.mjs';
import { RUNNER_OPTION_SCHEMA, vocabularyOf } from '../../runner-apis/runner-option.mjs';
import {
  constantNumber,
  findVariable,
  resolveConstant,
} from '../../analysis/constant-resolution.mjs';
import {
  importedCalleeName,
  isExpectCall,
  memberName,
  moduleBindings,
} from '../../analysis/test-code-analysis.mjs';

const { isTestFixture } = readLayout();
const TIMER_PROMISE_MODULES = new Set(['timers/promises', 'node:timers/promises']);
const FIND_QUERY = /^find(?:All)?By[A-Z]/u;
const RENDER_CALL = /^(?:render|within$)/u;
const TESTING_LIBRARY_MODULE = /^@testing-library\//u;
const VITEST_OBJECTS = new Set(['vi', 'vitest']);
const EXCEPTION_HINT = 'An exception fits only when a real wait is unavoidable.';

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
  for (const current of depthFirst(node, objectChildren)) {
    if (
      current?.type === 'CallExpression' &&
      isSetTimeout(current.callee) &&
      resolvesLater(current.arguments[0], resolveName)
    )
      return true;
  }
  return false;
}

function isRenderResult(context, identifier) {
  const [definition] = findVariable(context, identifier, identifier.name)?.defs ?? [];
  if (definition?.type === 'ImportBinding') {
    return TESTING_LIBRARY_MODULE.test(String(definition.parent.source.value));
  }
  const init = definition?.type === 'Variable' ? definition.node.init : undefined;
  const call = init?.type === 'AwaitExpression' ? init.argument : init;
  return (
    call?.type === 'CallExpression' &&
    call.callee.type === 'Identifier' &&
    RENDER_CALL.test(call.callee.name)
  );
}

function isQueryReceiver(context, object) {
  if (object.type === 'Identifier') {
    return object.name === 'screen' || isRenderResult(context, object);
  }
  return (
    object.type === 'CallExpression' &&
    object.callee.type === 'Identifier' &&
    object.callee.name === 'within'
  );
}

function isUiWait(context, call) {
  if (call?.type !== 'CallExpression') return false;
  const { callee } = call;
  const name = callee.type === 'Identifier' ? callee.name : memberName(callee);
  if (name === 'waitFor') {
    return callee.type === 'Identifier' || VITEST_OBJECTS.has(callee.object.name);
  }
  if (name === undefined || !FIND_QUERY.test(name)) return false;
  return callee.type === 'Identifier'
    ? isRenderResult(context, callee)
    : isQueryReceiver(context, callee.object);
}

function isCypressWait(context, node) {
  const { callee } = node;
  return (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'cy' &&
    memberName(callee) === 'wait' &&
    node.arguments.length > 0 &&
    constantNumber(context, node.arguments[0]) > 0
  );
}

function isPlaywrightTimeout(node) {
  return node.callee.type === 'MemberExpression' && memberName(node.callee) === 'waitForTimeout';
}

function isPromiseExecutorSleep(argument, timerPromises) {
  if (argument.type === 'NewExpression') {
    const executor = argument.arguments[0];
    return (
      argument.callee.type === 'Identifier' &&
      argument.callee.name === 'Promise' &&
      ['ArrowFunctionExpression', 'FunctionExpression'].includes(executor?.type) &&
      executor.params[0]?.type === 'Identifier' &&
      callsResolveTimeout(executor.body, executor.params[0].name)
    );
  }
  if (argument.type !== 'CallExpression') return false;
  const { callee } = argument;
  return (
    (callee.type === 'Identifier' && ['sleep', 'delay', 'wait'].includes(callee.name)) ||
    importedCalleeName(callee, timerPromises) === 'setTimeout' ||
    isSchedulerWait(callee, timerPromises)
  );
}

export const rule = {
  meta: {
    type: 'problem',
    schema: RUNNER_OPTION_SCHEMA,
    messages: {
      fixedSleep: `Fixed sleeps are non-deterministic; wait on a condition with {{waitOnCondition}}. ${EXCEPTION_HINT}`,
      negativeTimeoutAssertion: `Do not assert absence by letting a wait time out: \`.rejects\` passes only after the full timeout, so the test is slow and depends on the delay. Advance fake timers past the delay (\`{{advanceFakeTime}}\`) and assert absence at once, such as \`expect(screen.queryByRole('tooltip')).toBeNull()\`. ${EXCEPTION_HINT}`,
      playwrightTimeout: `\`waitForTimeout\` sleeps on wall-clock time. Wait on a condition instead, such as \`await expect(locator).toBeVisible()\`. ${EXCEPTION_HINT}`,
      cypressWait: `\`cy.wait(<number>)\` sleeps on wall-clock time. Wait on a request alias (\`cy.wait('@request')\`) or retry an assertion (\`cy.get(selector).should('be.visible')\`). ${EXCEPTION_HINT}`,
    },
  },
  create(context) {
    if (isTestFixture(context.filename)) return {};
    const data = vocabularyOf(context);
    let timerPromises = { named: new Map(), namespaces: new Set() };
    return {
      Program(node) {
        timerPromises = moduleBindings(node, TIMER_PROMISE_MODULES);
      },
      AwaitExpression(node) {
        if (isPromiseExecutorSleep(node.argument, timerPromises)) {
          context.report({ node, messageId: 'fixedSleep', data });
        }
      },
      CallExpression(node) {
        if (isPlaywrightTimeout(node)) context.report({ node, messageId: 'playwrightTimeout' });
        if (isCypressWait(context, node)) context.report({ node, messageId: 'cypressWait' });
      },
      MemberExpression(node) {
        if (memberName(node) !== 'rejects') return;
        const expectCall = node.object;
        if (
          isExpectCall(expectCall) &&
          isUiWait(context, resolveConstant(context, expectCall.arguments[0]))
        ) {
          context.report({ node: expectCall, messageId: 'negativeTimeoutAssertion', data });
        }
      },
    };
  },
};
