import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { readLayout } from '../../typed/policy-views.mts';
import { RUNNER_OPTION_SCHEMA, vocabularyOf } from '../../runner-apis/runner-option.mts';
import {
  constantNumber,
  findVariable,
  isFunctionNode,
  resolveConstant,
  type SourceContext,
} from '../../analysis/constant-resolution.mts';
import {
  importedCalleeName,
  isExpectCall,
  memberName,
  moduleBindings,
} from '../../analysis/test-code-analysis.mts';
import type { ModuleBindings } from '../../analysis/subprocess-calls.mts';
import { depthFirst, isNode, nameOf, objectChildren } from '../../typed/node-views.mts';

type MessageId = 'fixedSleep' | 'negativeTimeoutAssertion' | 'playwrightTimeout' | 'cypressWait';

const { DefinitionType } = TSESLint.Scope;
const { isTestFixture } = readLayout();
const TIMER_PROMISE_MODULES = new Set(['timers/promises', 'node:timers/promises']);
const SET_TIMEOUT = 'setTimeout';
const FIND_QUERY = /^find(?:All)?By[A-Z]/u;
const RENDER_CALL = /^(?:render|within$)/u;
const TESTING_LIBRARY_MODULE = /^@testing-library\//u;
const VITEST_OBJECTS = new Set(['vi', 'vitest']);
const EXCEPTION_HINT = 'An exception fits only when a real wait is unavoidable.';

function isSetTimeout(callee: TSESTree.Node): boolean {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name === SET_TIMEOUT;
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    ['globalThis', 'window', 'global'].includes(callee.object.name) &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === SET_TIMEOUT
  );
}

function isSchedulerWait(callee: TSESTree.Node, timerPromises: ModuleBindings): boolean {
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === 'wait' &&
    importedCalleeName(callee.object, timerPromises) === 'scheduler'
  );
}

function singleExpression(callback: TSESTree.Node): TSESTree.Node | undefined {
  if (!isFunctionNode(callback)) {
    return undefined;
  }
  const { body } = callback;
  if (body.type !== AST_NODE_TYPES.BlockStatement) {
    return body;
  }
  const [only] = body.body;
  return body.body.length === 1 && only?.type === AST_NODE_TYPES.ExpressionStatement
    ? only.expression
    : undefined;
}

function onlyCalls(callback: TSESTree.Node | undefined, resolveName: string): boolean {
  const body = callback === undefined ? undefined : singleExpression(callback);
  return (
    body?.type === AST_NODE_TYPES.CallExpression &&
    body.callee.type === AST_NODE_TYPES.Identifier &&
    body.callee.name === resolveName
  );
}

function resolvesLater(argument: TSESTree.Node | undefined, resolveName: string): boolean {
  return (
    (argument?.type === AST_NODE_TYPES.Identifier && argument.name === resolveName) ||
    onlyCalls(argument, resolveName)
  );
}

function callsResolveTimeout(node: TSESTree.Node, resolveName: string): boolean {
  for (const current of depthFirst<object>(node, objectChildren)) {
    if (
      isNode(current) &&
      current.type === AST_NODE_TYPES.CallExpression &&
      isSetTimeout(current.callee) &&
      resolvesLater(current.arguments[0], resolveName)
    ) {
      return true;
    }
  }
  return false;
}

function isRenderResult(context: SourceContext, identifier: TSESTree.Identifier): boolean {
  const [definition] = findVariable(context, identifier, identifier.name)?.defs ?? [];
  if (definition?.type === DefinitionType.ImportBinding) {
    return (
      definition.parent.type === AST_NODE_TYPES.ImportDeclaration &&
      TESTING_LIBRARY_MODULE.test(definition.parent.source.value)
    );
  }
  const init = definition?.type === DefinitionType.Variable ? definition.node.init : undefined;
  const call = init?.type === AST_NODE_TYPES.AwaitExpression ? init.argument : init;
  return (
    call?.type === AST_NODE_TYPES.CallExpression &&
    call.callee.type === AST_NODE_TYPES.Identifier &&
    RENDER_CALL.test(call.callee.name)
  );
}

function isQueryReceiver(context: SourceContext, object: TSESTree.Node): boolean {
  if (object.type === AST_NODE_TYPES.Identifier) {
    return object.name === 'screen' || isRenderResult(context, object);
  }
  return (
    object.type === AST_NODE_TYPES.CallExpression &&
    object.callee.type === AST_NODE_TYPES.Identifier &&
    object.callee.name === 'within'
  );
}

function isVitestObject(callee: TSESTree.Node): boolean {
  const object =
    callee.type === AST_NODE_TYPES.MemberExpression ? nameOf(callee.object) : undefined;
  return object !== undefined && VITEST_OBJECTS.has(object);
}

function isUiWait(context: SourceContext, call: TSESTree.Node | undefined): boolean {
  if (call?.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const { callee } = call;
  const name = callee.type === AST_NODE_TYPES.Identifier ? callee.name : memberName(callee);
  if (name === 'waitFor') {
    return callee.type === AST_NODE_TYPES.Identifier || isVitestObject(callee);
  }
  if (name === undefined || !FIND_QUERY.test(name)) {
    return false;
  }
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return isRenderResult(context, callee);
  }
  return callee.type === AST_NODE_TYPES.MemberExpression && isQueryReceiver(context, callee.object);
}

function isCypressWait(context: SourceContext, node: TSESTree.CallExpression): boolean {
  const { callee } = node;
  const delay = constantNumber(context, node.arguments[0]);
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'cy' &&
    memberName(callee) === 'wait' &&
    node.arguments.length > 0 &&
    delay !== undefined &&
    delay > 0
  );
}

function isPlaywrightTimeout(node: TSESTree.CallExpression): boolean {
  return (
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    memberName(node.callee) === 'waitForTimeout'
  );
}

function isPromiseExecutorSleep(argument: TSESTree.Node, timerPromises: ModuleBindings): boolean {
  if (argument.type === AST_NODE_TYPES.NewExpression) {
    const executor = argument.arguments[0];
    return (
      argument.callee.type === AST_NODE_TYPES.Identifier &&
      argument.callee.name === 'Promise' &&
      isFunctionNode(executor) &&
      executor.params[0]?.type === AST_NODE_TYPES.Identifier &&
      callsResolveTimeout(executor.body, executor.params[0].name)
    );
  }
  if (argument.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const { callee } = argument;
  return (
    (callee.type === AST_NODE_TYPES.Identifier &&
      ['sleep', 'delay', 'wait'].includes(callee.name)) ||
    importedCalleeName(callee, timerPromises) === SET_TIMEOUT ||
    isSchedulerWait(callee, timerPromises)
  );
}

export const rule: TSESLint.RuleModule<MessageId> = {
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
    if (isTestFixture(context.filename)) {
      return {};
    }
    const data = vocabularyOf(context);
    let timerPromises: ModuleBindings = { named: new Map(), namespaces: new Set() };
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
        if (isPlaywrightTimeout(node)) {
          context.report({ node, messageId: 'playwrightTimeout' });
        }
        if (isCypressWait(context, node)) {
          context.report({ node, messageId: 'cypressWait' });
        }
      },
      MemberExpression(node) {
        if (memberName(node) !== 'rejects') {
          return;
        }
        const expectCall = node.object;
        if (
          expectCall.type === AST_NODE_TYPES.CallExpression &&
          isExpectCall(expectCall) &&
          isUiWait(context, resolveConstant(context, expectCall.arguments[0]))
        ) {
          context.report({ node: expectCall, messageId: 'negativeTimeoutAssertion', data });
        }
      },
    };
  },
};
