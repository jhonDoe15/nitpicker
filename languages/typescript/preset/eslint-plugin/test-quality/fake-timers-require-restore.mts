import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf } from '../rules/typed/node-views.mts';
import {
  type RunnerApis,
  createRunnerApis,
  kindOfObject,
  propertyName,
  runnerApiVisitors,
} from '../rules/runner-apis/runner-apis.mts';
import { calleeTimerChange, fakeTimerChange } from '../rules/runner-apis/runner-doubles.mts';
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
type TrackedCall = {
  readonly node: TSESTree.CallExpression;
  readonly restoredBy: string | undefined;
  readonly kind?: string;
  readonly stub?: string;
};
type ClockRestore = { readonly restore: string; readonly advance: string };
type Tracking = {
  readonly checkedStubs: ReadonlySet<string>;
  readonly testModules: ReadonlySet<string>;
};
type ReportPlan = {
  readonly usesUserEvent: boolean;
  readonly plan: ReturnType<typeof restoreHookFix>;
};

const STUB_GLOBAL = 'stubGlobal';
const STUB_ENV = 'stubEnv';

const RESTORING_HOOKS = new Set(['afterEach', 'afterAll', 'after', 'onTestFinished']);
const USER_EVENT_PACKAGE = '@testing-library/user-event';
const NODE_TEST_MODULE = 'node:test';
const HOOK_FIXED_CLOCKS = new Set(['vitest']);
const STUB_RESTORES = new Map([
  [STUB_GLOBAL, 'unstubAllGlobals'],
  [STUB_ENV, 'unstubAllEnvs'],
]);
const STUB_MESSAGES = new Map<string, MessageId>([
  [STUB_GLOBAL, 'unrestoredGlobal'],
  [STUB_ENV, 'unrestoredEnv'],
]);
const CLOCK_RESTORES: Readonly<Record<string, ClockRestore>> = {
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

function isRestoringHook(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.Identifier &&
    RESTORING_HOOKS.has(node.callee.name)
  );
}

function isRootHookMethod(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.Property &&
    node.key.type === AST_NODE_TYPES.Identifier &&
    RESTORING_HOOKS.has(node.key.name) &&
    node.parent.type === AST_NODE_TYPES.ObjectExpression
  );
}

function isRestoredByHookOrFinally(call: TSESTree.Node): boolean {
  return ancestorsOf(call).some(
    (ancestor) =>
      isRestoringHook(ancestor) ||
      isRootHookMethod(ancestor) ||
      (ancestor.type === AST_NODE_TYPES.TryStatement &&
        ancestor.finalizer !== null &&
        ancestor.finalizer.range[0] <= call.range[0]),
  );
}

function vitestMember(apis: RunnerApis, node: TSESTree.Node | undefined): string | undefined {
  if (node?.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  return kindOfObject(apis, node.object) === 'vitest' ? propertyName(node) : undefined;
}

function isTestContextClock(
  call: TSESTree.CallExpression,
  testModules: ReadonlySet<string>,
): boolean {
  const timers =
    call.callee.type === AST_NODE_TYPES.MemberExpression ? call.callee.object : undefined;
  const mock = timers?.type === AST_NODE_TYPES.MemberExpression ? timers.object : undefined;
  return (
    mock?.type === AST_NODE_TYPES.MemberExpression &&
    !(mock.object.type === AST_NODE_TYPES.Identifier && testModules.has(mock.object.name))
  );
}

function restoreOf(apis: RunnerApis, callee: TSESTree.Node): string[] {
  const change = calleeTimerChange(apis, callee);
  const stub = vitestMember(apis, callee);
  return [change?.fake === false ? `clock:${change.kind}` : undefined, stub].flatMap((restore) =>
    restore === undefined || restore === '' ? [] : [restore],
  );
}

function restoresIn(apis: RunnerApis, node: TSESTree.CallExpression): string[] {
  if (isRestoringHook(node)) {
    return node.arguments.flatMap((argument) => restoreOf(apis, argument));
  }
  return isRestoredByHookOrFinally(node) ? restoreOf(apis, node.callee) : [];
}

function trackedCall(
  apis: RunnerApis,
  node: TSESTree.CallExpression,
  { checkedStubs, testModules }: Tracking,
): TrackedCall | undefined {
  const change = fakeTimerChange(apis, node);
  if (change?.fake === true && !isTestContextClock(node, testModules)) {
    return { node, kind: change.kind, restoredBy: `clock:${change.kind}` };
  }
  const stub = vitestMember(apis, node.callee);
  return stub !== undefined && checkedStubs.has(stub)
    ? { node, stub, restoredBy: STUB_RESTORES.get(stub) }
    : undefined;
}

function clockData(kind: string | undefined): { readonly data?: ClockRestore } {
  const data = CLOCK_RESTORES[kind ?? ''];
  return data === undefined ? {} : { data };
}

function report(context: Context, tracked: TrackedCall, { usesUserEvent, plan }: ReportPlan): void {
  if (tracked.stub !== undefined) {
    context.report(
      fixable(
        { node: tracked.node, messageId: STUB_MESSAGES.get(tracked.stub) ?? 'unrestored' },
        plan,
      ),
    );
    return;
  }
  context.report(
    fixable(
      {
        node: tracked.node,
        messageId: usesUserEvent ? 'unrestoredWithUserEvent' : 'unrestored',
        ...clockData(tracked.kind),
      },
      plan,
    ),
  );
}

function fixedMethod(tracked: TrackedCall): string | undefined {
  if (tracked.node.callee.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  if (tracked.stub !== undefined) {
    return tracked.stub;
  }
  return HOOK_FIXED_CLOCKS.has(tracked.kind ?? '') ? propertyName(tracked.node.callee) : undefined;
}

function reportUnrestored(
  context: Context,
  unrestored: readonly TrackedCall[],
  usesUserEvent: boolean,
): void {
  const planned = new Set<string>();
  for (const tracked of unrestored) {
    const method = fixedMethod(tracked);
    const plan =
      method === undefined || planned.has(method)
        ? undefined
        : restoreHookFix(context.sourceCode, tracked.node, method);
    if (method !== undefined && plan !== undefined) {
      planned.add(method);
    }
    report(context, tracked, { usesUserEvent, plan });
  }
}

function checkedStubsFor(options: Readonly<Record<string, unknown>>): Set<string> {
  return new Set([
    ...(options['globals'] === true ? [STUB_GLOBAL] : []),
    ...(options['envs'] === true ? [STUB_ENV] : []),
  ]);
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
      unrestored: 'Fake timers stay on for the tests that follow. Restore them: {{restore}}.',
      unrestoredWithUserEvent:
        'Fake timers stay on for the tests that follow. Restore them: {{restore}}. With user-event, create the user with `userEvent.setup({ advanceTimers: {{advance}} })` or its clicks wait forever.',
      unrestoredGlobal: `This stubbed global stays stubbed for the tests that follow. Restore it: \`afterEach(() => { vi.unstubAllGlobals(); });\`, or stub it once in a setup file.`,
      unrestoredEnv: `This stubbed environment variable stays set for the tests that follow. Restore it: \`afterEach(() => { vi.unstubAllEnvs(); });\`.`,
      unrestoredEnvWrite:
        'This write to `process.env` stays for the tests that follow, so they pass or fail depending on the order they run in. Use `vi.stubEnv(name, value)` with `afterEach(() => { vi.unstubAllEnvs(); })`, or save the old value and put it back in `afterEach` or `finally`.',
      unrestoredGlobalWrite:
        'This global override stays for the tests that follow, so they pass or fail depending on the order they run in. Use `vi.stubGlobal`, `vi.spyOn(object, name)` or `vi.useFakeTimers()` and restore them in `afterEach`, or save the old value and put it back in `afterEach` or `finally`.',
    },
  },
  create(context) {
    const checkedStubs = checkedStubsFor(context.options[0] ?? {});
    const apis = createRunnerApis();
    const visitors = runnerApiVisitors(apis);
    const calls: TrackedCall[] = [];
    const restored = new Set<string | undefined>();
    const state = { usesUserEvent: false };
    const testModules = new Set<string>();
    const writes = createWriteTracker(context.sourceCode, isRestoredByHookOrFinally);
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
      AssignmentExpression(node) {
        visitors.AssignmentExpression(node);
        writes.record(node);
      },
      UnaryExpression: writes.record,
      CallExpression(node) {
        writes.call(node);
        const tracked = trackedCall(apis, node, { checkedStubs, testModules });
        if (tracked !== undefined) {
          calls.push(tracked);
        }
        for (const restore of restoresIn(apis, node)) {
          restored.add(restore);
        }
      },
      'Program:exit'() {
        reportUnrestored(
          context,
          calls.filter(({ restoredBy }) => !restored.has(restoredBy)),
          state.usesUserEvent,
        );
        for (const { node, messageId } of writes.unrestored()) {
          context.report({ node, messageId });
        }
      },
    };
  },
};
