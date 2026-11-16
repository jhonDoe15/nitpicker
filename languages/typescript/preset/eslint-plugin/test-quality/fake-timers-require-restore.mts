import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, nameOf } from '../rules/typed/node-views.mts';
import { vitestImportAliases } from '../rules/test-runtime/vitest-aliases.mts';
import { fixable } from '../fixes/support/descriptors.mts';
import { restoreHookFix } from '../fixes/tests/restore-hook-fix.mts';
import { createWriteTracker } from './direct-writes/direct-writes.mts';

type MessageId =
  | 'unrestored'
  | 'unrestoredWithUserEvent'
  | 'unrestoredGlobal'
  | 'unrestoredEnv'
  | 'unrestoredEnvWrite'
  | 'unrestoredGlobalWrite';
type Options = readonly [Readonly<Record<string, unknown>>?];
type Context = Readonly<TSESLint.RuleContext<MessageId, Options>>;
type TrackedCall = { readonly node: TSESTree.CallExpression; readonly method: string };
type State = { usesUserEvent: boolean };

const FAKE_TIMERS = 'useFakeTimers';
const STUB_GLOBAL = 'stubGlobal';
const STUB_ENV = 'stubEnv';
const RESTORING_HOOKS = new Set(['afterEach', 'afterAll', 'onTestFinished']);
const USER_EVENT_PACKAGE = '@testing-library/user-event';
const RESTORES = new Map([
  [FAKE_TIMERS, 'useRealTimers'],
  [STUB_GLOBAL, 'unstubAllGlobals'],
  [STUB_ENV, 'unstubAllEnvs'],
]);
const STUB_MESSAGES = new Map<string, MessageId>([
  [STUB_GLOBAL, 'unrestoredGlobal'],
  [STUB_ENV, 'unrestoredEnv'],
]);

function isRestoringHook(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.Identifier &&
    RESTORING_HOOKS.has(node.callee.name)
  );
}

function isRestoredByHookOrFinally(call: TSESTree.Node): boolean {
  return ancestorsOf(call).some(
    (ancestor) =>
      isRestoringHook(ancestor) ||
      (ancestor.type === AST_NODE_TYPES.TryStatement &&
        ancestor.finalizer !== null &&
        ancestor.finalizer.range[0] <= call.range[0]),
  );
}

function viMember(
  node: TSESTree.Node | undefined,
  aliases: ReadonlySet<string>,
): string | undefined {
  if (node?.type !== AST_NODE_TYPES.MemberExpression || node.computed) {
    return undefined;
  }
  const object = nameOf(node.object);
  return object !== undefined && aliases.has(object) ? nameOf(node.property) : undefined;
}

function restoresIn(
  node: TSESTree.CallExpression,
  aliases: ReadonlySet<string>,
): (string | undefined)[] {
  if (isRestoringHook(node)) {
    return node.arguments.map((argument) => viMember(argument, aliases));
  }
  return isRestoredByHookOrFinally(node) ? [viMember(node.callee, aliases)] : [];
}

function messageIdFor(method: string, state: State): MessageId {
  if (method !== FAKE_TIMERS) {
    return STUB_MESSAGES.get(method) ?? 'unrestored';
  }
  return state.usesUserEvent ? 'unrestoredWithUserEvent' : 'unrestored';
}

const RESTORE_TIMERS = 'Restore them: `afterEach(() => { vi.useRealTimers(); });`.';

function reportUnrestoredCalls(
  context: Context,
  {
    calls,
    restored,
    state,
  }: {
    calls: readonly TrackedCall[];
    restored: ReadonlySet<string | undefined>;
    state: State;
  },
): void {
  const planned = new Set();
  const unrestored = calls.filter(({ method }) => !restored.has(RESTORES.get(method)));
  for (const { node, method } of unrestored) {
    const plan = planned.has(method) ? undefined : restoreHookFix(context.sourceCode, node, method);
    if (plan !== undefined) {
      planned.add(method);
    }
    context.report(fixable({ node, messageId: messageIdFor(method, state) }, plan));
  }
}

export const rule: TSESLint.RuleModule<MessageId, Options> = {
  meta: {
    type: 'problem',
    fixable: 'code',
    docs: {
      description:
        'Require fake timers, stubs, and writes to process.env or to globals made in test files, to be restored',
    },
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
      unrestoredEnvWrite:
        'This write to `process.env` stays for the tests that follow, so they pass or fail depending on the order they run in. Use `vi.stubEnv(name, value)` with `afterEach(() => { vi.unstubAllEnvs(); })`, or save the old value and put it back in `afterEach` or `finally`.',
      unrestoredGlobalWrite:
        'This global override stays for the tests that follow, so they pass or fail depending on the order they run in. Use `vi.stubGlobal`, `vi.spyOn(object, name)` or `vi.useFakeTimers()` and restore them in `afterEach`, or save the old value and put it back in `afterEach` or `finally`.',
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const checked = new Set<string>([
      FAKE_TIMERS,
      ...(options['globals'] === true ? [STUB_GLOBAL] : []),
      ...(options['envs'] === true ? [STUB_ENV] : []),
    ]);
    const aliases = new Set(['vi', 'vitest']);
    const calls: TrackedCall[] = [];
    const restored = new Set<string | undefined>();
    const state: State = { usesUserEvent: false };
    const writes = createWriteTracker(context.sourceCode, isRestoredByHookOrFinally);
    return {
      ImportDeclaration(node) {
        state.usesUserEvent ||= node.source.value === USER_EVENT_PACKAGE;
        for (const alias of vitestImportAliases(aliases, node)) {
          aliases.add(alias);
        }
      },
      AssignmentExpression: writes.record,
      UnaryExpression: writes.record,
      CallExpression(node) {
        writes.call(node);
        const method = viMember(node.callee, aliases);
        if (method !== undefined && checked.has(method)) {
          calls.push({ node, method });
        }
        for (const restore of restoresIn(node, aliases)) {
          restored.add(restore);
        }
      },
      'Program:exit'() {
        reportUnrestoredCalls(context, { calls, restored, state });
        for (const { node, messageId } of writes.unrestored()) {
          context.report({ node, messageId });
        }
      },
    };
  },
};
