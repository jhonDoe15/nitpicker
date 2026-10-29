import { ancestorsOf } from '../rules/analysis/ancestry.mjs';
import {
  createRunnerApis,
  kindOfObject,
  propertyName,
  runnerApiVisitors,
} from '../rules/runner-apis/runner-apis.mjs';
import { fakeTimerChange } from '../rules/runner-apis/runner-doubles.mjs';

const RESTORING_HOOKS = new Set(['afterEach', 'afterAll', 'after', 'onTestFinished']);
const USER_EVENT_PACKAGE = '@testing-library/user-event';
const NODE_TEST_MODULE = 'node:test';
const STUB_RESTORES = new Map([
  ['stubGlobal', 'unstubAllGlobals'],
  ['stubEnv', 'unstubAllEnvs'],
]);
const STUB_MESSAGES = new Map([
  ['stubGlobal', 'unrestoredGlobal'],
  ['stubEnv', 'unrestoredEnv'],
]);
const CLOCK_RESTORES = {
  vitest: {
    restore: '`afterEach(() => { vi.useRealTimers(); });`',
    advance: 'vi.advanceTimersByTime',
  },
  jest: {
    restore: '`afterEach(() => { jest.useRealTimers(); });`',
    advance: 'jest.advanceTimersByTime',
  },
  node: {
    restore:
      '`afterEach(() => { mock.timers.reset(); });`, or enable them on the test context (`t.mock.timers.enable()`), which resets when the test ends',
    advance: '(ms) => mock.timers.tick(ms)',
  },
  sinon: {
    restore:
      '`afterEach(() => { clock.restore(); });` (`clock.uninstall()` for a clock from `@sinonjs/fake-timers`)',
    advance: '(ms) => clock.tick(ms)',
  },
};

function isRestoringHook(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    RESTORING_HOOKS.has(node.callee.name)
  );
}

function isRootHookMethod(node) {
  return (
    node.type === 'Property' &&
    node.key.type === 'Identifier' &&
    RESTORING_HOOKS.has(node.key.name) &&
    node.parent.type === 'ObjectExpression'
  );
}

function isRestoredByHookOrFinally(call) {
  return ancestorsOf(call).some(
    (ancestor) =>
      isRestoringHook(ancestor) ||
      isRootHookMethod(ancestor) ||
      (ancestor.type === 'TryStatement' && ancestor.finalizer?.range[0] <= call.range[0]),
  );
}

function vitestMember(apis, node) {
  if (node?.type !== 'MemberExpression') {
    return undefined;
  }
  return kindOfObject(apis, node.object) === 'vitest' ? propertyName(node) : undefined;
}

function isTestContextClock(call, testModules) {
  const timers = call.callee.object;
  const mock = timers?.type === 'MemberExpression' ? timers.object : undefined;
  return (
    mock?.type === 'MemberExpression' &&
    !(mock.object.type === 'Identifier' && testModules.has(mock.object.name))
  );
}

function restoresIn(apis, node) {
  const restoring = isRestoringHook(node)
    ? node.arguments.map((argument) => ({ callee: argument }))
    : [node].filter((call) => isRestoredByHookOrFinally(call));
  return restoring.flatMap((call) => {
    const change = fakeTimerChange(apis, call);
    const stub = vitestMember(apis, call.callee);
    return [change?.fake === false ? `clock:${change.kind}` : undefined, stub].filter(Boolean);
  });
}

function trackedCall(apis, node, { checkedStubs, testModules }) {
  const change = fakeTimerChange(apis, node);
  if (change?.fake === true && !isTestContextClock(node, testModules)) {
    return { node, kind: change.kind, restoredBy: `clock:${change.kind}` };
  }
  const stub = vitestMember(apis, node.callee);
  return checkedStubs.has(stub) ? { node, stub, restoredBy: STUB_RESTORES.get(stub) } : undefined;
}

function report(context, tracked, usesUserEvent) {
  if (tracked.stub !== undefined) {
    context.report({ node: tracked.node, messageId: STUB_MESSAGES.get(tracked.stub) });
    return;
  }
  context.report({
    node: tracked.node,
    messageId: usesUserEvent ? 'unrestoredWithUserEvent' : 'unrestored',
    data: CLOCK_RESTORES[tracked.kind],
  });
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Require fake timers, and stubs made in test files, to be restored' },
    schema: [
      {
        type: 'object',
        properties: { globals: { type: 'boolean' }, envs: { type: 'boolean' } },
        additionalProperties: false,
      },
    ],
    messages: {
      unrestored: 'Fake timers stay on for the tests that follow. Restore them: {{restore}}.',
      unrestoredWithUserEvent:
        'Fake timers stay on for the tests that follow. Restore them: {{restore}}. With user-event, create the user with `userEvent.setup({ advanceTimers: {{advance}} })` or its clicks wait forever.',
      unrestoredGlobal: `This stubbed global stays stubbed for the tests that follow. Restore it: \`afterEach(() => { vi.unstubAllGlobals(); });\`, or stub it once in a setup file.`,
      unrestoredEnv: `This stubbed environment variable stays set for the tests that follow. Restore it: \`afterEach(() => { vi.unstubAllEnvs(); });\`.`,
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const checkedStubs = new Set([
      ...(options.globals ? ['stubGlobal'] : []),
      ...(options.envs ? ['stubEnv'] : []),
    ]);
    const apis = createRunnerApis();
    const visitors = runnerApiVisitors(apis);
    const calls = [];
    const restored = new Set();
    const state = { usesUserEvent: false };
    const testModules = new Set();
    return {
      ...visitors,
      ImportDeclaration(node) {
        visitors.ImportDeclaration(node);
        state.usesUserEvent ||= node.source.value === USER_EVENT_PACKAGE;
        if (node.source.value === NODE_TEST_MODULE) {
          for (const specifier of node.specifiers) {
            testModules.add(specifier.local.name);
          }
        }
      },
      CallExpression(node) {
        const tracked = trackedCall(apis, node, { checkedStubs, testModules });
        if (tracked !== undefined) {
          calls.push(tracked);
        }
        for (const restore of restoresIn(apis, node)) {
          restored.add(restore);
        }
      },
      'Program:exit'() {
        for (const tracked of calls.filter(({ restoredBy }) => !restored.has(restoredBy))) {
          report(context, tracked, state.usesUserEvent);
        }
      },
    };
  },
};
