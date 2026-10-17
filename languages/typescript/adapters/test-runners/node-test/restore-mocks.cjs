'use strict';

const { afterEach, beforeEach, mock } = process.getBuiltinModule('node:test');
const { pathToFileURL } = process.getBuiltinModule('node:url');

const PRELOAD_OPTIONS = new Set(['--require', '-r', '--import']);
const DOUBLE_FACTORIES = ['fn', 'method', 'getter', 'setter', 'property'];
const ownSpecifiers = new Set([__filename, pathToFileURL(__filename).href]);
const execArguments = process.execArgv;
const ANY_VALUE = new Error('a value of any type').cause;

function preloadedWithRequire() {
  return execArguments.some(
    (argument, index) => argument === __filename && execArguments[index - 1] === '--require',
  );
}

function ownArgumentIndexes() {
  return execArguments.flatMap((argument, index) => {
    if (ownSpecifiers.has(argument) && PRELOAD_OPTIONS.has(execArguments[index - 1] ?? '')) {
      return [index - 1, index];
    }
    const [name = '', ...value] = argument.split('=');
    return PRELOAD_OPTIONS.has(name) && ownSpecifiers.has(value.join('=')) ? [index] : [];
  });
}

function withoutOwnPreload() {
  const own = new Set(ownArgumentIndexes());
  const kept = execArguments.filter((_argument, index) => !own.has(index));
  execArguments.splice(0, execArguments.length, ...kept);
}

function newRecord() {
  return { active: false, doubles: [ANY_VALUE].slice(1) };
}

function callRestore(context = ANY_VALUE, restore = ANY_VALUE) {
  if (typeof restore === 'function') {
    Reflect.apply(restore, context, []);
  }
}

function restoreMockContext(context = ANY_VALUE) {
  if (typeof context === 'function' || (typeof context === 'object' && context !== null)) {
    callRestore(context, Reflect.get(context, 'restore'));
  }
}

function restoreDouble(double = ANY_VALUE) {
  if (typeof double === 'function' || (typeof double === 'object' && double !== null)) {
    restoreMockContext(Reflect.get(double, 'mock') ?? double);
  }
}

function recordFactory(name = '', factory = ANY_VALUE, recorded = newRecord()) {
  if (typeof factory !== 'function') {
    return;
  }
  function remember(double = ANY_VALUE) {
    if (recorded.active) {
      recorded.doubles.push(double);
    }
    return double;
  }
  const recording = new Proxy(factory, {
    apply: (target, thisArgument, replaced) =>
      remember(Reflect.apply(target, thisArgument, replaced)),
  });
  Reflect.set(mock, name, recording);
}

function registerRestore() {
  const recorded = newRecord();
  for (const name of DOUBLE_FACTORIES) {
    recordFactory(name, Reflect.get(mock, name), recorded);
  }
  beforeEach(() => {
    recorded.active = true;
  });
  afterEach(() => {
    recorded.active = false;
    for (const double of recorded.doubles.splice(0).toReversed()) {
      restoreDouble(double);
    }
  });
}

const startsTestProcesses =
  execArguments.includes('--test') && process.env.NODE_TEST_CONTEXT === undefined;

if (!startsTestProcesses || !preloadedWithRequire()) {
  registerRestore();
}

if (!startsTestProcesses) {
  withoutOwnPreload();
}
