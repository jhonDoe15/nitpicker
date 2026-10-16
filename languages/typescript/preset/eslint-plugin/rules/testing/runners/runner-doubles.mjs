import { kindOfObject, propertyName } from './runner-apis.mjs';

const FAKE_TIMERS_ON = {
  vitest: ['useFakeTimers'],
  jest: ['useFakeTimers'],
  node: ['enable'],
  sinon: ['useFakeTimers'],
  fakeTimers: ['install'],
};

const FAKE_TIMERS_OFF = {
  vitest: ['useRealTimers'],
  jest: ['useRealTimers'],
  node: ['reset'],
  sinon: ['restore'],
  clock: ['restore', 'uninstall'],
};

const CLOCK_KINDS = { fakeTimers: 'sinon', clock: 'sinon' };

const SPY_METHODS = {
  vitest: ['spyOn'],
  jest: ['spyOn'],
  node: ['method', 'getter', 'setter'],
  sinon: ['stub', 'spy', 'replace', 'replaceGetter', 'replaceSetter'],
  testdouble: ['replace'],
};

const ANY_RUNNER_SPY = 'spyOn';

function nodeTimerMethod(apis, callee) {
  const method = propertyName(callee);
  const timers = callee.type === 'MemberExpression' ? callee.object : undefined;
  const isTimers = timers !== undefined && propertyName(timers) === 'timers';
  return isTimers && kindOfObject(apis, timers.object) === 'node' ? method : undefined;
}

function fakeFlag(kind, method) {
  if (FAKE_TIMERS_ON[kind]?.includes(method)) {
    return true;
  }
  return FAKE_TIMERS_OFF[kind]?.includes(method) ? false : undefined;
}

export function fakeTimerChange(apis, call) {
  const { callee } = call;
  if (callee.type !== 'MemberExpression') {
    return undefined;
  }
  const nodeMethod = nodeTimerMethod(apis, callee);
  const kind = nodeMethod === undefined ? kindOfObject(apis, callee.object) : 'node';
  const fake = fakeFlag(kind, nodeMethod ?? propertyName(callee));
  return fake === undefined ? undefined : { kind: CLOCK_KINDS[kind] ?? kind, fake };
}

export function waitKind(apis, call) {
  const { callee } = call;
  if (callee.type === 'Identifier') {
    return apis.kinds.get(callee.name) === 'waitFor' ? 'testing-library' : undefined;
  }
  const isVitestWait =
    propertyName(callee) === 'waitFor' && kindOfObject(apis, callee.object) === 'vitest';
  return isVitestWait ? 'vitest' : undefined;
}

function isSpyCall(apis, callee) {
  const method = propertyName(callee);
  if (method === ANY_RUNNER_SPY) {
    return true;
  }
  return method !== undefined && SPY_METHODS[kindOfObject(apis, callee.object)]?.includes(method);
}

export function spiedMember(apis, call) {
  const [target, property] = call.arguments;
  const onObject = target !== undefined && target.type !== 'Literal';
  return onObject && property !== undefined && isSpyCall(apis, call.callee) === true
    ? { target, property }
    : undefined;
}
