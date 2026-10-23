import { calledMethod, kindOfObject, propertyName } from './runner-apis.mjs';

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

function timerMethod(apis, callee) {
  const nodeMethod = nodeTimerMethod(apis, callee);
  return nodeMethod === undefined
    ? calledMethod(apis, callee)
    : { kind: 'node', method: nodeMethod };
}

export function fakeTimerChange(apis, call) {
  const called = timerMethod(apis, call.callee);
  const fake = called === undefined ? undefined : fakeFlag(called.kind, called.method);
  return fake === undefined ? undefined : { kind: CLOCK_KINDS[called.kind] ?? called.kind, fake };
}

const CLOCK_SETTERS = {
  vitest: ['setSystemTime'],
  jest: ['setSystemTime'],
  node: ['setTime'],
  clock: ['setSystemTime'],
};
const DATE_LISTS = ['apis', 'toFake'];

function keyName(property) {
  if (property.type !== 'Property') {
    return undefined;
  }
  return property.key.type === 'Identifier' ? property.key.name : property.key.value;
}

function listedNames(options, key) {
  const property = options?.properties.find((candidate) => keyName(candidate) === key);
  if (property?.value.type !== 'ArrayExpression') {
    return undefined;
  }
  return property.value.elements.map((element) => element?.value);
}

function fakesDate(call) {
  const options = call.arguments.find((argument) => argument.type === 'ObjectExpression');
  const faked = DATE_LISTS.map((key) => listedNames(options, key)).find(Boolean);
  if (faked !== undefined && !faked.includes('Date')) {
    return false;
  }
  return !(listedNames(options, 'doNotFake') ?? []).includes('Date');
}

export function setsFakeClock(apis, call) {
  const called = timerMethod(apis, call.callee);
  if (called !== undefined && CLOCK_SETTERS[called.kind]?.includes(called.method)) {
    return true;
  }
  return fakeTimerChange(apis, call)?.fake === true && fakesDate(call);
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
  if (propertyName(callee) === ANY_RUNNER_SPY) {
    return true;
  }
  const called = calledMethod(apis, callee);
  return called?.method !== undefined && SPY_METHODS[called.kind]?.includes(called.method);
}

export function spiedMember(apis, call) {
  const [target, property] = call.arguments;
  const onObject = target !== undefined && target.type !== 'Literal';
  return onObject && property !== undefined && isSpyCall(apis, call.callee) === true
    ? { target, property }
    : undefined;
}
