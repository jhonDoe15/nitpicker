import { ancestorsOf } from '../rules/ancestry.mjs';

const RESTORING_HOOKS = new Set(['afterEach', 'afterAll']);
const USER_EVENT_PACKAGE = '@testing-library/user-event';

function isRestoringHook(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    RESTORING_HOOKS.has(node.callee.name)
  );
}

function isRestoredByHookOrFinally(call) {
  return ancestorsOf(call).some(
    (ancestor) =>
      isRestoringHook(ancestor) ||
      (ancestor.type === 'TryStatement' && ancestor.finalizer?.range[0] <= call.range[0]),
  );
}

function viMethodName(node, aliases) {
  const callee = node.callee;
  if (callee.type !== 'MemberExpression' || callee.computed) return undefined;
  return aliases.has(callee.object.name) ? callee.property.name : undefined;
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Require fake timers to be restored in afterEach' },
    schema: [],
    messages: {
      unrestored:
        'Fake timers stay on for the tests that follow. Restore them: `afterEach(() => { vi.useRealTimers(); });`. A justified exception goes in nitpicker.config.json.',
      unrestoredWithUserEvent:
        'Fake timers stay on for the tests that follow. Restore them: `afterEach(() => { vi.useRealTimers(); });`. With user-event, create the user with `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })` or its clicks wait forever. A justified exception goes in nitpicker.config.json.',
    },
  },
  create(context) {
    const aliases = new Set(['vi', 'vitest']);
    const fakeCalls = [];
    const state = { restores: false, usesUserEvent: false };
    return {
      ImportDeclaration(node) {
        state.usesUserEvent ||= node.source.value === USER_EVENT_PACKAGE;
        if (node.source.value !== 'vitest') return;
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier' && aliases.has(specifier.imported.name)) {
            aliases.add(specifier.local.name);
          }
        }
      },
      CallExpression(node) {
        const method = viMethodName(node, aliases);
        if (method === 'useFakeTimers') fakeCalls.push(node);
        if (method === 'useRealTimers' && isRestoredByHookOrFinally(node)) state.restores = true;
      },
      'Program:exit'() {
        if (state.restores) return;
        const messageId = state.usesUserEvent ? 'unrestoredWithUserEvent' : 'unrestored';
        for (const call of fakeCalls) {
          context.report({ node: call, messageId });
        }
      },
    };
  },
};
