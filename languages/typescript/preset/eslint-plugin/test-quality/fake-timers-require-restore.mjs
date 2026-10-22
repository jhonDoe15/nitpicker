import { ancestorsOf } from '../rules/analysis/ancestry.mjs';

const RESTORING_HOOKS = new Set(['afterEach', 'afterAll', 'onTestFinished']);
const USER_EVENT_PACKAGE = '@testing-library/user-event';
const RESTORES = new Map([
  ['useFakeTimers', 'useRealTimers'],
  ['stubGlobal', 'unstubAllGlobals'],
  ['stubEnv', 'unstubAllEnvs'],
]);
const STUB_MESSAGES = new Map([
  ['stubGlobal', 'unrestoredGlobal'],
  ['stubEnv', 'unrestoredEnv'],
]);

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

function viMember(node, aliases) {
  if (node?.type !== 'MemberExpression' || node.computed) {
    return undefined;
  }
  return aliases.has(node.object.name) ? node.property.name : undefined;
}

function restoresIn(node, aliases) {
  if (isRestoringHook(node)) {
    return node.arguments.map((argument) => viMember(argument, aliases));
  }
  return isRestoredByHookOrFinally(node) ? [viMember(node.callee, aliases)] : [];
}

function messageIdFor(method, state) {
  if (method !== 'useFakeTimers') {
    return STUB_MESSAGES.get(method);
  }
  return state.usesUserEvent ? 'unrestoredWithUserEvent' : 'unrestored';
}

const RESTORE_TIMERS = 'Restore them: `afterEach(() => { vi.useRealTimers(); });`.';

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
      unrestored: `Fake timers stay on for the tests that follow. ${RESTORE_TIMERS}`,
      unrestoredWithUserEvent: `Fake timers stay on for the tests that follow. ${RESTORE_TIMERS} With user-event, create the user with \`userEvent.setup({ advanceTimers: vi.advanceTimersByTime })\` or its clicks wait forever.`,
      unrestoredGlobal: `This stubbed global stays stubbed for the tests that follow. Restore it: \`afterEach(() => { vi.unstubAllGlobals(); });\`, or stub it once in a setup file.`,
      unrestoredEnv: `This stubbed environment variable stays set for the tests that follow. Restore it: \`afterEach(() => { vi.unstubAllEnvs(); });\`.`,
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const checked = new Set([
      'useFakeTimers',
      ...(options.globals ? ['stubGlobal'] : []),
      ...(options.envs ? ['stubEnv'] : []),
    ]);
    const aliases = new Set(['vi', 'vitest']);
    const calls = [];
    const restored = new Set();
    const state = { usesUserEvent: false };
    return {
      ImportDeclaration(node) {
        state.usesUserEvent ||= node.source.value === USER_EVENT_PACKAGE;
        if (node.source.value !== 'vitest') {
          return;
        }
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier' && aliases.has(specifier.imported.name)) {
            aliases.add(specifier.local.name);
          }
        }
      },
      CallExpression(node) {
        const method = viMember(node.callee, aliases);
        if (checked.has(method)) {
          calls.push({ node, method });
        }
        for (const restore of restoresIn(node, aliases)) {
          restored.add(restore);
        }
      },
      'Program:exit'() {
        for (const { node, method } of calls) {
          if (!restored.has(RESTORES.get(method))) {
            context.report({ node, messageId: messageIdFor(method, state) });
          }
        }
      },
    };
  },
};
