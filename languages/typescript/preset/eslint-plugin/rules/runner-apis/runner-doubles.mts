import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { type CalledMethod, type RunnerApis, calledMethod, kindOfObject, propertyName } from './runner-apis.mts';

type Lists = Readonly<Record<string, readonly string[]>>;
export type TimerChange = { readonly kind: string; readonly fake: boolean };
export type SpiedMember = {
  readonly target: TSESTree.CallExpressionArgument;
  readonly property: TSESTree.CallExpressionArgument;
};

const USE_FAKE_TIMERS = 'useFakeTimers';
const SET_SYSTEM_TIME = 'setSystemTime';

const FAKE_TIMERS_ON: Lists = {
  vitest: [USE_FAKE_TIMERS],
  jest: [USE_FAKE_TIMERS],
  node: ['enable'],
  sinon: [USE_FAKE_TIMERS],
  fakeTimers: ['install'],
};

const FAKE_TIMERS_OFF: Lists = {
  vitest: ['useRealTimers'],
  jest: ['useRealTimers'],
  node: ['reset'],
  sinon: ['restore'],
  clock: ['restore', 'uninstall'],
};

const CLOCK_KINDS: Readonly<Record<string, string>> = { fakeTimers: 'sinon', clock: 'sinon' };

const SPY_METHODS: Lists = {
  vitest: ['spyOn'],
  jest: ['spyOn'],
  node: ['method', 'getter', 'setter'],
  sinon: ['stub', 'spy', 'replace', 'replaceGetter', 'replaceSetter'],
  testdouble: ['replace'],
};

const ANY_RUNNER_SPY = 'spyOn';

function listed(lists: Lists, kind: string | undefined, method: string | undefined): boolean {
  return method !== undefined && lists[kind ?? '']?.includes(method) === true;
}

function nodeTimerMethod(apis: RunnerApis, callee: TSESTree.Node): string | undefined {
  const method = propertyName(callee);
  const timers = callee.type === AST_NODE_TYPES.MemberExpression ? callee.object : undefined;
  const isTimers =
    timers?.type === AST_NODE_TYPES.MemberExpression && propertyName(timers) === 'timers';
  return isTimers && kindOfObject(apis, timers.object) === 'node' ? method : undefined;
}

function fakeFlag(kind: string | undefined, method: string | undefined): boolean | undefined {
  if (listed(FAKE_TIMERS_ON, kind, method)) {
    return true;
  }
  return listed(FAKE_TIMERS_OFF, kind, method) ? false : undefined;
}

function timerMethod(apis: RunnerApis, callee: TSESTree.Node): CalledMethod | undefined {
  const nodeMethod = nodeTimerMethod(apis, callee);
  return nodeMethod === undefined
    ? calledMethod(apis, callee)
    : { kind: 'node', method: nodeMethod };
}

export function fakeTimerChange(
  apis: RunnerApis,
  call: TSESTree.CallExpression,
): TimerChange | undefined {
  return calleeTimerChange(apis, call.callee);
}

export function calleeTimerChange(
  apis: RunnerApis,
  callee: TSESTree.Node,
): TimerChange | undefined {
  const called = timerMethod(apis, callee);
  const fake = called === undefined ? undefined : fakeFlag(called.kind, called.method);
  if (called?.kind === undefined || fake === undefined) {
    return undefined;
  }
  return { kind: CLOCK_KINDS[called.kind] ?? called.kind, fake };
}

const CLOCK_SETTERS: Lists = {
  vitest: [SET_SYSTEM_TIME],
  jest: [SET_SYSTEM_TIME],
  node: ['setTime'],
  clock: [SET_SYSTEM_TIME],
};
const DATE_LISTS = ['apis', 'toFake'];

function keyName(property: TSESTree.ObjectLiteralElement): string | undefined {
  if (property.type !== AST_NODE_TYPES.Property) {
    return undefined;
  }
  const { key } = property;
  if (key.type === AST_NODE_TYPES.Identifier) {
    return key.name;
  }
  return key.type === AST_NODE_TYPES.Literal ? String(key.value) : undefined;
}

function listedNames(
  options: TSESTree.ObjectExpression | undefined,
  key: string,
): unknown[] | undefined {
  const property = options?.properties.find((candidate) => keyName(candidate) === key);
  if (
    property?.type !== AST_NODE_TYPES.Property ||
    property.value.type !== AST_NODE_TYPES.ArrayExpression
  ) {
    return undefined;
  }
  return property.value.elements.map((element) =>
    element?.type === AST_NODE_TYPES.Literal ? element.value : undefined,
  );
}

function fakesDate(call: TSESTree.CallExpression): boolean {
  const options = call.arguments.find(
    (argument) => argument.type === AST_NODE_TYPES.ObjectExpression,
  );
  const faked = DATE_LISTS.map((key) => listedNames(options, key)).find(
    (names) => names !== undefined,
  );
  if (faked !== undefined && !faked.includes('Date')) {
    return false;
  }
  return !(listedNames(options, 'doNotFake') ?? []).includes('Date');
}

export function setsFakeClock(apis: RunnerApis, call: TSESTree.CallExpression): boolean {
  const called = timerMethod(apis, call.callee);
  if (called !== undefined && listed(CLOCK_SETTERS, called.kind, called.method)) {
    return true;
  }
  return fakeTimerChange(apis, call)?.fake === true && fakesDate(call);
}

export function waitKind(apis: RunnerApis, call: TSESTree.CallExpression): string | undefined {
  const { callee } = call;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return apis.kinds.get(callee.name) === 'waitFor' ? 'testing-library' : undefined;
  }
  const isVitestWait =
    callee.type === AST_NODE_TYPES.MemberExpression &&
    propertyName(callee) === 'waitFor' &&
    kindOfObject(apis, callee.object) === 'vitest';
  return isVitestWait ? 'vitest' : undefined;
}

function isSpyCall(apis: RunnerApis, callee: TSESTree.Node): boolean {
  if (propertyName(callee) === ANY_RUNNER_SPY) {
    return true;
  }
  const called = calledMethod(apis, callee);
  return called !== undefined && listed(SPY_METHODS, called.kind, called.method);
}

export function spiedMember(
  apis: RunnerApis,
  call: TSESTree.CallExpression,
): SpiedMember | undefined {
  const [target, property] = call.arguments;
  const onObject = target !== undefined && target.type !== AST_NODE_TYPES.Literal;
  return onObject && property !== undefined && isSpyCall(apis, call.callee)
    ? { target, property }
    : undefined;
}
